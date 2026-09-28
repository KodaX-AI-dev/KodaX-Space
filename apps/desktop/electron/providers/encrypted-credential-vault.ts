import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { replaceFileIfUnchanged } from '../kodax/atomic-file.js';

const VAULT_VERSION = 1 as const;
const MAX_ACCOUNTS = 256;
const MAX_ACCOUNT_LENGTH = 64;
const MAX_CIPHERTEXT_LENGTH = 16_384;

export interface CredentialVaultCipher {
  encrypt(plainText: string): Promise<Buffer>;
  decrypt(
    encrypted: Buffer,
  ): Promise<{ readonly result: string; readonly shouldReEncrypt: boolean }>;
}

interface CredentialVaultState {
  readonly version: typeof VAULT_VERSION;
  readonly records: Record<string, string>;
  readonly revokedLegacyAccounts: readonly string[];
}

export class CredentialVaultCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialVaultCorruptError';
  }
}

export class CredentialVaultDecryptionError extends Error {
  readonly #ciphertext: string;

  constructor(ciphertext: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Credential decryption failed.', { cause });
    this.name = 'CredentialVaultDecryptionError';
    this.#ciphertext = ciphertext;
  }

  get ciphertext(): string {
    return this.#ciphertext;
  }
}

async function writeRecoveryBackup(filePath: string, bytes: Buffer): Promise<void> {
  try {
    await fs.writeFile(filePath, bytes, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (!(await fs.readFile(filePath)).equals(bytes)) {
      throw new Error('Credential recovery backup does not match.');
    }
  }
}

function emptyState(): CredentialVaultState {
  return { version: VAULT_VERSION, records: {}, revokedLegacyAccounts: [] };
}

function isSafeAccount(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= MAX_ACCOUNT_LENGTH &&
    value !== '__proto__' &&
    value !== 'prototype' &&
    value !== 'constructor'
  );
}

function isCanonicalBase64(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_CIPHERTEXT_LENGTH) {
    return false;
  }
  try {
    return Buffer.from(value, 'base64').toString('base64') === value;
  } catch {
    return false;
  }
}

function parseState(raw: unknown): CredentialVaultState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CredentialVaultCorruptError('credential vault root must be an object');
  }
  const candidate = raw as Record<string, unknown>;
  if (candidate.version !== VAULT_VERSION) {
    throw new CredentialVaultCorruptError('credential vault version is unsupported');
  }
  if (
    !candidate.records ||
    typeof candidate.records !== 'object' ||
    Array.isArray(candidate.records)
  ) {
    throw new CredentialVaultCorruptError('credential vault records must be an object');
  }
  const recordEntries = Object.entries(candidate.records as Record<string, unknown>);
  if (recordEntries.length > MAX_ACCOUNTS) {
    throw new CredentialVaultCorruptError('credential vault has too many accounts');
  }
  const records: Record<string, string> = {};
  for (const [account, ciphertext] of recordEntries) {
    if (!isSafeAccount(account) || !isCanonicalBase64(ciphertext)) {
      throw new CredentialVaultCorruptError('credential vault contains an invalid record');
    }
    records[account] = ciphertext;
  }

  if (!Array.isArray(candidate.revokedLegacyAccounts)) {
    throw new CredentialVaultCorruptError('credential vault legacy revocations must be an array');
  }
  const revokedLegacyAccounts = [...new Set(candidate.revokedLegacyAccounts)];
  if (
    revokedLegacyAccounts.length > MAX_ACCOUNTS ||
    revokedLegacyAccounts.some((account) => !isSafeAccount(account))
  ) {
    throw new CredentialVaultCorruptError('credential vault contains an invalid legacy revocation');
  }

  return {
    version: VAULT_VERSION,
    records,
    revokedLegacyAccounts: revokedLegacyAccounts as string[],
  };
}

function cloneState(state: CredentialVaultState): CredentialVaultState {
  return {
    version: VAULT_VERSION,
    records: { ...state.records },
    revokedLegacyAccounts: [...state.revokedLegacyAccounts],
  };
}

export class EncryptedCredentialVault {
  private cached: CredentialVaultState | null = null;
  private loadPromise: Promise<CredentialVaultState> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly cipher: CredentialVaultCipher,
  ) {}

  async listAccounts(): Promise<readonly string[]> {
    return Object.keys((await this.load()).records);
  }

  async has(account: string): Promise<boolean> {
    return Object.hasOwn((await this.load()).records, account);
  }

  async isLegacyRevoked(account: string): Promise<boolean> {
    return (await this.load()).revokedLegacyAccounts.includes(account);
  }

  async get(account: string): Promise<string | undefined> {
    const ciphertext = (await this.load()).records[account];
    if (ciphertext === undefined) return undefined;
    const decrypted = await this.cipher
      .decrypt(Buffer.from(ciphertext, 'base64'))
      .catch((cause: unknown) => {
        throw new CredentialVaultDecryptionError(ciphertext, cause);
      });
    if (decrypted.shouldReEncrypt) {
      await this.rotateIfUnchanged(account, ciphertext, decrypted.result);
    }
    return decrypted.result;
  }

  /** Caller must verify the candidate belongs to the existing identity first. */
  async recover(account: string, previousCiphertext: string, secret: string): Promise<string> {
    if (!isSafeAccount(account)) throw new Error('invalid credential account');
    const encrypted = await this.cipher.encrypt(secret);
    if ((await this.cipher.decrypt(encrypted)).result !== secret) {
      throw new Error('Recovered credential failed encryption verification.');
    }
    const operation = this.writeQueue.then(() =>
      this.installRecoveredRecord(account, previousCiphertext, encrypted),
    );
    this.writeQueue = operation.catch(() => undefined);
    await operation;
    return secret;
  }

  private async installRecoveredRecord(
    account: string,
    previousCiphertext: string,
    encrypted: Buffer,
  ): Promise<void> {
    const stat = await fs.lstat(this.filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1 || stat.size > 8 * 1024 * 1024) {
      throw new Error('Credential recovery requires a safe standalone vault.');
    }
    const bytes = await fs.readFile(this.filePath);
    const current = parseState(JSON.parse(bytes.toString('utf8')));
    if (
      current.records[account] !== previousCiphertext ||
      current.revokedLegacyAccounts.includes(account)
    ) {
      throw new Error('Credential changed during recovery; retry after relaunch.');
    }
    const next = parseState({
      ...current,
      records: { ...current.records, [account]: encrypted.toString('base64') },
    });
    const hash = createHash('sha256').update(bytes).digest('hex');
    const backup = `${this.filePath}.${hash}.before-recovery.json`;
    await writeRecoveryBackup(backup, bytes);
    await replaceFileIfUnchanged(
      this.filePath,
      Buffer.from(`${JSON.stringify(next, null, 2)}\n`),
      `sha256:${hash}`,
      'Credential changed during recovery; retry after relaunch.',
      8 * 1024 * 1024,
    );
    this.cached = next;
  }

  async set(account: string, secret: string): Promise<void> {
    if (!isSafeAccount(account)) throw new Error('invalid credential account');
    const encrypted = await this.cipher.encrypt(secret);
    const ciphertext = encrypted.toString('base64');
    if (!isCanonicalBase64(ciphertext)) throw new Error('encrypted credential is too large');
    await this.mutate((state) => {
      const records = { ...state.records, [account]: ciphertext };
      if (Object.keys(records).length > MAX_ACCOUNTS) {
        throw new Error('credential vault account limit exceeded');
      }
      return {
        version: VAULT_VERSION,
        records,
        revokedLegacyAccounts: state.revokedLegacyAccounts.filter((item) => item !== account),
      };
    });
  }

  /** A delayed legacy read must not undo a newer save or deletion. */
  async importLegacy(account: string, secret: string): Promise<string | undefined> {
    if (!isSafeAccount(account)) throw new Error('invalid credential account');
    const ciphertext = (await this.cipher.encrypt(secret)).toString('base64');
    if (!isCanonicalBase64(ciphertext)) throw new Error('encrypted credential is too large');
    await this.mutate((state) => {
      if (Object.hasOwn(state.records, account) || state.revokedLegacyAccounts.includes(account)) {
        return state;
      }
      return { ...state, records: { ...state.records, [account]: ciphertext } };
    });
    return this.get(account);
  }

  /**
   * Removes an encrypted Provider record without decrypting it. The legacy
   * tombstone prevents an old per-Provider Keychain item from being imported
   * again if best-effort physical cleanup is unavailable.
   */
  async delete(account: string): Promise<boolean> {
    if (!isSafeAccount(account)) return false;
    let existed = false;
    await this.mutate((state) => {
      existed = Object.hasOwn(state.records, account);
      const records = { ...state.records };
      delete records[account];
      return {
        version: VAULT_VERSION,
        records,
        revokedLegacyAccounts: [...new Set([...state.revokedLegacyAccounts, account])],
      };
    });
    return existed;
  }

  private async rotateIfUnchanged(
    account: string,
    previousCiphertext: string,
    secret: string,
  ): Promise<void> {
    const encrypted = await this.cipher.encrypt(secret);
    const ciphertext = encrypted.toString('base64');
    if (!isCanonicalBase64(ciphertext)) return;
    await this.mutate((state) => {
      if (state.records[account] !== previousCiphertext) return state;
      return {
        ...state,
        records: { ...state.records, [account]: ciphertext },
      };
    });
  }

  private async mutate(
    update: (state: CredentialVaultState) => CredentialVaultState,
  ): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      const current = cloneState(await this.load());
      const next = parseState(update(current));
      await this.write(next);
      this.cached = next;
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  private async load(): Promise<CredentialVaultState> {
    if (this.cached) return this.cached;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = (async () => {
      try {
        const raw = await fs.readFile(this.filePath, 'utf8');
        return parseState(JSON.parse(raw));
      } catch (err) {
        const error = err as NodeJS.ErrnoException;
        if (error.code === 'ENOENT') return emptyState();
        if (err instanceof CredentialVaultCorruptError) throw err;
        throw new CredentialVaultCorruptError('credential vault could not be read');
      }
    })();
    try {
      this.cached = await this.loadPromise;
      return this.cached;
    } finally {
      this.loadPromise = null;
    }
  }

  private async write(state: CredentialVaultState): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      await fs.rename(tmp, this.filePath);
      if (process.platform !== 'win32') await fs.chmod(this.filePath, 0o600);
    } finally {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
    }
  }
}
