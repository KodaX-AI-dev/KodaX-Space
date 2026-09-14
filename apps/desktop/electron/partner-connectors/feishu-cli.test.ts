import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FeishuCli,
  FeishuCliError,
  type FeishuCliRunner,
  type FeishuCreateBaseInput,
} from './feishu-cli.js';

const expected = { appId: 'cli_sample', openId: 'ou_sample' };
const docUrl = 'https://sample.feishu.cn/docx/docToken';
const baseScopes = [
  'base:app:create',
  'base:table:read',
  'base:table:create',
  'base:table:update',
  'base:table:delete',
] as const;
const baseFields: FeishuCreateBaseInput['fields'] = [
  { type: 'text', name: '事项' },
  {
    type: 'select',
    name: '状态',
    multiple: false,
    options: [{ name: '待处理' }, { name: '已完成' }],
  },
  { type: 'datetime', name: '截止时间', style: { format: 'yyyy-MM-dd' } },
];
const baseInput = {
  profile: 'partner',
  expected,
  folderUrl: 'https://sample.feishu.cn/drive/folder/folderToken',
  baseName: '项目台账',
  tableName: '任务',
  fields: baseFields,
};
const validIdentity = {
  appId: expected.appId,
  brand: 'feishu',
  identities: {
    user: {
      available: true,
      verified: true,
      openId: expected.openId,
      userName: '测试',
      scope: [
        'docx:document:readonly',
        'docx:document:create',
        'docx:document:write_only',
        ...baseScopes,
      ].join(' '),
    },
  },
};

test('createBase sends one bounded typed field document with the exact official user command', async () => {
  let businessCalls = 0;
  const cli = new FeishuCli(
    fixture(async ({ args, stdin }) => {
      businessCalls++;
      assert.deepEqual(args, [
        '--profile=partner',
        'base',
        '+base-create',
        '--as',
        'user',
        '--format',
        'json',
        '--name',
        '项目台账',
        '--folder-token',
        'folderToken',
        '--time-zone',
        'Asia/Shanghai',
        '--table-name',
        '任务',
        '--fields',
        JSON.stringify(baseFields),
      ]);
      assert.equal(stdin, undefined);
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          ok: true,
          identity: 'user',
          data: {
            created: true,
            base: { app_token: 'baseToken', name: '项目台账' },
            table: { id: 'tblTask', name: '任务' },
            fields: baseFields.map((field, index) => ({
              id: `fld${index}`,
              ...field,
            })),
            default_table_deleted: true,
            deleted_default_table_id: 'tblDefault',
          },
        }),
      };
    }),
  );
  assert.deepEqual(await cli.createBase(baseInput), {
    status: 'success',
    baseToken: 'baseToken',
    tableId: 'tblTask',
    url: 'https://www.feishu.cn/base/baseToken',
  });
  assert.equal(businessCalls, 1);
});

test('createBase defaults to the personal space when no folder is supplied', async () => {
  const cli = new FeishuCli(
    fixture(async ({ args }) => {
      assert.deepEqual(args, [
        '--profile=partner',
        'base',
        '+base-create',
        '--as',
        'user',
        '--format',
        'json',
        '--name',
        '项目台账',
        '--time-zone',
        'Asia/Shanghai',
        '--table-name',
        '任务',
        '--fields',
        JSON.stringify(baseFields),
      ]);
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          ok: true,
          identity: 'user',
          data: {
            created: true,
            base: { app_token: 'baseToken', name: '项目台账' },
            table: { id: 'tblTask', name: '任务' },
            fields: baseFields.map((field, index) => ({ id: `fld${index}`, ...field })),
            default_table_deleted: true,
            deleted_default_table_id: 'tblDefault',
          },
        }),
      };
    }),
  );
  const { folderUrl: _folderUrl, ...personalSpaceInput } = baseInput;
  assert.equal((await cli.createBase(personalSpaceInput)).status, 'success');
});

test('createBase only accepts a success receipt with the complete requested field configuration', async () => {
  let result = 'partial_success';
  let fields: Array<Record<string, unknown>> = baseFields.map((field, index) => ({
    id: `fld${index}`,
    ...field,
  }));
  const cli = new FeishuCli(
    fixture(async () => ({
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify({
        ok: true,
        identity: 'user',
        data: {
          result,
          created: true,
          base: { app_token: 'baseToken', name: '项目台账' },
          table: { id: 'tblTask', name: '任务' },
          fields,
          default_table_deleted: true,
          deleted_default_table_id: 'tblDefault',
        },
      }),
    })),
  );
  assert.equal((await cli.createBase(baseInput)).status, 'partial');
  result = 'success';
  fields = baseFields.map((field, index) => ({ id: `fld${index}`, ...field }));
  fields[1] = { ...fields[1], multiple: true, options: [{ name: '待处理' }] };
  assert.equal((await cli.createBase(baseInput)).status, 'partial');
  fields = baseFields.map((field, index) => ({ id: `fld${index}`, ...field }));
  fields[2] = { ...fields[2], style: { format: 'MM-dd' } };
  assert.equal((await cli.createBase(baseInput)).status, 'partial');
  result = 'unexpected';
  fields = baseFields.map((field, index) => ({ id: `fld${index}`, ...field }));
  assert.equal((await cli.createBase(baseInput)).status, 'unknown');
});

test('createBase revalidates the selected account after its async dispatch gate', async () => {
  let currentIdentity = validIdentity;
  let businessCalls = 0;
  const cli = new FeishuCli(
    fixture(
      async () => {
        businessCalls++;
        throw new Error('business command must not spawn');
      },
      () => currentIdentity,
    ),
  );
  await assert.rejects(
    cli.createBase({
      ...baseInput,
      beforeDispatch: async () => {
        currentIdentity = {
          ...validIdentity,
          identities: {
            user: { ...validIdentity.identities.user, openId: 'ou_other' },
          },
        };
      },
    }),
    (error: unknown) =>
      error instanceof FeishuCliError && error.code === 'identity_changed' && !error.dispatched,
  );
  assert.equal(businessCalls, 0);
});

test('createBase rejects untyped or under-scoped input before dispatch and never retries uncertain receipts', async () => {
  let businessCalls = 0;
  const business: FeishuCliRunner = async () => {
    businessCalls++;
    return {
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify({
        ok: true,
        identity: 'user',
        data: {
          created: true,
          base: { app_token: 'baseToken', name: '项目台账' },
          table: { id: 'tblTask', name: '任务' },
          fields: [],
          default_table_deleted: false,
          deleted_default_table_id: 'tblDefault',
        },
      }),
    };
  };
  const cli = new FeishuCli(fixture(business));
  assert.equal((await cli.createBase(baseInput)).status, 'partial');
  assert.equal(businessCalls, 1);
  await assert.rejects(
    cli.createBase({
      ...baseInput,
      fields: [{ type: 'formula', name: '公式', expression: '1+1' }],
    } as never),
    (error: unknown) =>
      error instanceof FeishuCliError && error.code === 'invalid_input' && !error.dispatched,
  );
  const noScope = new FeishuCli(
    fixture(business, {
      ...validIdentity,
      identities: {
        user: {
          ...validIdentity.identities.user,
          scope: baseScopes.slice(0, -1).join(' '),
        },
      },
    }),
  );
  await assert.rejects(
    noScope.createBase(baseInput),
    (error: unknown) =>
      error instanceof FeishuCliError && error.code === 'missing_scope' && !error.dispatched,
  );
  assert.equal(businessCalls, 1);
});

test('inspect forwards its optional cancellation signal to both verification subprocesses', async () => {
  const signal = new AbortController().signal;
  const cli = new FeishuCli(async (request) => {
    assert.equal(request.signal, signal);
    return {
      exitCode: 0,
      stderr: '',
      stdout: request.args.includes('--version')
        ? 'lark-cli version 1.0.92'
        : JSON.stringify(validIdentity),
    };
  });
  assert.ok((await cli.inspect('partner', signal)).identity);
});

function fixture(
  business: FeishuCliRunner,
  identity: unknown | (() => unknown) = validIdentity,
): FeishuCliRunner {
  return async (request) => {
    if (request.args.includes('--version'))
      return { stdout: 'lark-cli version 1.0.92', stderr: '', exitCode: 0 };
    if (request.args.includes('auth'))
      return {
        stdout: JSON.stringify(typeof identity === 'function' ? identity() : identity),
        stderr: '',
        exitCode: 0,
      };
    return business(request);
  };
}

test('inspect identifies the explicitly selected, verified Feishu user without exposing tokens', async () => {
  const calls: string[][] = [];
  const cli = new FeishuCli(async ({ args }) => {
    calls.push([...args]);
    return {
      exitCode: 0,
      stderr: '',
      stdout: args.includes('--version')
        ? 'lark-cli version 1.0.92\n'
        : JSON.stringify({
            appId: 'cli_sample',
            brand: 'feishu',
            identity: 'user',
            identities: {
              user: {
                available: true,
                verified: true,
                openId: 'ou_sample',
                userName: '测试用户',
                scope: 'docx:document:readonly',
              },
            },
          }),
    };
  });
  assert.deepEqual(await cli.inspect('partner'), {
    installed: true,
    version: '1.0.92',
    identity: {
      appId: 'cli_sample',
      openId: 'ou_sample',
      label: '测试用户',
      profile: 'partner',
      scopes: ['docx:document:readonly'],
    },
  });
  assert.deepEqual(calls, [
    ['--version'],
    ['--profile=partner', 'auth', 'status', '--json', '--verify'],
  ]);
});

test('missing or blank account display names fall back to the profile, not private identity', async () => {
  for (const userName of [undefined, '', ' \n ']) {
    const identity = {
      ...validIdentity,
      identities: { user: { ...validIdentity.identities.user, userName } },
    };
    const cli = new FeishuCli(
      fixture(async () => {
        throw new Error('no business call');
      }, identity),
    );
    assert.equal((await cli.inspect('partner')).identity?.label, 'partner');
  }
});

test('read checks the selected identity and extracts the title from the Markdown export envelope', async () => {
  const cli = new FeishuCli(
    fixture(async ({ args }) => {
      assert.deepEqual(args, [
        '--profile=partner',
        'docs',
        '+fetch',
        '--as',
        'user',
        '--format',
        'json',
        '--doc',
        'docToken',
        '--doc-format',
        'markdown',
        '--detail',
        'simple',
      ]);
      return {
        stdout: JSON.stringify({
          ok: true,
          identity: 'user',
          data: {
            document: {
              document_id: 'docToken',
              revision_id: 7,
              content: '<title>项目&amp;摘要</title>\n\n# 项目摘要\n内容',
            },
          },
        }),
        stderr: '',
        exitCode: 0,
      };
    }),
  );
  assert.deepEqual(await cli.read({ profile: 'partner', expected, documentUrl: docUrl }), {
    documentId: 'docToken',
    url: docUrl,
    title: '项目&摘要',
    revision: 7,
    content: '<title>项目&amp;摘要</title>\n\n# 项目摘要\n内容',
  });
});

test('create imports approved Markdown into the selected folder through stdin', async () => {
  const cli = new FeishuCli(
    fixture(async ({ args, stdin }) => {
      assert.deepEqual(args, [
        '--profile=partner',
        'docs',
        '+create',
        '--as',
        'user',
        '--format',
        'json',
        '--doc-format',
        'markdown',
        '--title',
        'A & B',
        '--parent-token',
        'folderToken',
        '--content',
        '-',
      ]);
      assert.equal(stdin, '# 更新\n\n- x & y');
      assert.ok(!args.some((arg) => arg.includes('/secret')));
      return {
        stdout: JSON.stringify({
          ok: true,
          identity: 'user',
          data: {
            document: { document_id: 'docToken', revision_id: 1, url: docUrl },
            warnings: [],
          },
        }),
        stderr: '',
        exitCode: 0,
      };
    }),
  );
  assert.deepEqual(
    await cli.create({
      profile: 'partner',
      expected,
      folderUrl: 'https://sample.feishu.cn/drive/folder/folderToken',
      title: 'A & B',
      text: '# 更新\n\n- x & y',
    }),
    {
      status: 'success',
      documentId: 'docToken',
      url: docUrl,
      revision: 1,
    },
  );
});

test('create rejects Markdown resources before the CLI can read local files or fetch remote media', async () => {
  let businessCalls = 0;
  const cli = new FeishuCli(
    fixture(async () => {
      businessCalls++;
      throw new Error('must not dispatch');
    }),
  );
  for (const text of [
    '![secret](@./secret.txt)',
    '![remote](https://example.com/image.png)',
    '<img path="@./secret.txt"/>',
    '<source path="@./secret.txt"/>',
    '<html5-block path="@contract-canary.html"/>',
    '<whiteboard type="mermaid" path="@contract-canary.mmd"/>',
    '<WHITEBOARD\n type="svg" path="@contract-canary.svg"/>',
    '![local][image]\n\n[image]: @contract-canary.png',
    '![local]\n\n[local]: @contract-canary.png',
    '![multiline\ncaption](@contract-canary.png)',
  ]) {
    await assert.rejects(
      cli.create({ profile: 'partner', expected, title: '安全检查', text }),
      (error: unknown) =>
        error instanceof FeishuCliError && error.code === 'invalid_input' && !error.dispatched,
    );
  }
  assert.equal(businessCalls, 0);
});

test('create defaults to the official my library position when no folder is supplied', async () => {
  const cli = new FeishuCli(
    fixture(async ({ args }) => {
      assert.deepEqual(args, [
        '--profile=partner',
        'docs',
        '+create',
        '--as',
        'user',
        '--format',
        'json',
        '--doc-format',
        'markdown',
        '--title',
        '周报',
        '--parent-position',
        'my_library',
        '--content',
        '-',
      ]);
      return {
        stdout: JSON.stringify({
          ok: true,
          identity: 'user',
          data: {
            document: { document_id: 'docToken', revision_id: 1, url: docUrl },
            warnings: [],
          },
        }),
        stderr: '',
        exitCode: 0,
      };
    }),
  );
  assert.equal(
    (
      await cli.create({
        profile: 'partner',
        expected,
        title: '周报',
        text: '本周进展',
      })
    ).status,
    'success',
  );
});

test('append rechecks the approved base revision and forwards it without overwriting existing content', async () => {
  const commands: string[] = [];
  const cli = new FeishuCli(
    fixture(async ({ args, stdin }) => {
      const fetch = args.includes('+fetch');
      commands.push(fetch ? 'fetch' : 'append');
      if (!fetch) {
        assert.deepEqual(args, [
          '--profile=partner',
          'docs',
          '+update',
          '--as',
          'user',
          '--format',
          'json',
          '--doc',
          'docToken',
          '--command',
          'append',
          '--revision-id',
          '7',
          '--doc-format',
          'xml',
          '--content',
          '-',
        ]);
        assert.equal(stdin, '<p>approved &lt;text&gt;</p>');
      }
      return {
        stdout: JSON.stringify({
          ok: true,
          identity: 'user',
          data: fetch
            ? { document: { document_id: 'docToken', revision_id: 7, content: 'original' } }
            : {
                result: 'success',
                document: { revision_id: 8 },
                updated_blocks_count: 1,
                warnings: [],
              },
        }),
        stderr: '',
        exitCode: 0,
      };
    }),
  );
  assert.deepEqual(
    await cli.append({
      profile: 'partner',
      expected,
      documentUrl: docUrl,
      baseRevision: 7,
      text: 'approved <text>',
    }),
    { status: 'success', documentId: 'docToken', url: docUrl, revision: 8 },
  );
  assert.deepEqual(commands, ['fetch', 'append']);
  await assert.rejects(
    cli.append({
      profile: 'partner',
      expected,
      documentUrl: docUrl,
      baseRevision: 6,
      text: 'approved',
    }),
    (error: unknown) =>
      error instanceof FeishuCliError && error.code === 'revision_changed' && !error.dispatched,
  );
  assert.deepEqual(commands, ['fetch', 'append', 'fetch']);
});

test('host approval checkpoint runs after preflight and can revoke a write before dispatch', async () => {
  let reads = 0;
  let writes = 0;
  const cli = new FeishuCli(
    fixture(async ({ args }) => {
      if (args.includes('+fetch')) reads++;
      else writes++;
      return {
        stdout: JSON.stringify({
          ok: true,
          identity: 'user',
          data: { document: { document_id: 'docToken', revision_id: 7, content: 'original' } },
        }),
        stderr: '',
        exitCode: 0,
      };
    }),
  );
  const revoked = new Error('host checkpoint revoked');
  const beforeDispatch = async () => {
    throw revoked;
  };
  await assert.rejects(
    cli.create({
      profile: 'partner',
      expected,
      folderUrl: 'https://sample.feishu.cn/drive/folder/folderToken',
      title: 'title',
      text: 'body',
      beforeDispatch,
    }),
    (error: unknown) => error === revoked,
  );
  await assert.rejects(
    cli.append({
      profile: 'partner',
      expected,
      documentUrl: docUrl,
      baseRevision: 7,
      text: 'body',
      beforeDispatch,
    }),
    (error: unknown) => error === revoked,
  );
  assert.equal(reads, 1);
  assert.equal(writes, 0);
});

test('read checkpoint can revoke access after authentication and append does not use write approval during its read', async () => {
  let calls = 0;
  let writeCheckpoints = 0;
  const cli = new FeishuCli(
    fixture(async () => {
      calls++;
      throw new Error('must not fetch');
    }),
  );
  const revoked = new Error('host read scope revoked');
  const beforeRead = async () => {
    throw revoked;
  };
  await assert.rejects(
    cli.read({ profile: 'partner', expected, documentUrl: docUrl, beforeRead }),
    (error: unknown) => error === revoked,
  );
  await assert.rejects(
    cli.append({
      profile: 'partner',
      expected,
      documentUrl: docUrl,
      baseRevision: 7,
      text: 'body',
      beforeRead,
      beforeDispatch: async () => {
        writeCheckpoints++;
      },
    }),
    (error: unknown) => error === revoked,
  );
  assert.equal(calls, 0);
  assert.equal(writeCheckpoints, 0);
});

test('synchronous guards catch revocation in the final checkpoint microtask and preserve host errors', async () => {
  let reads = 0;
  let writes = 0;
  const cli = new FeishuCli(
    fixture(async ({ args }) => {
      if (args.includes('+fetch')) reads++;
      else writes++;
      return {
        stdout: JSON.stringify({
          ok: true,
          identity: 'user',
          data: { document: { document_id: 'docToken', revision_id: 7, content: 'original' } },
        }),
        stderr: '',
        exitCode: 0,
      };
    }),
  );
  let revoked = false;
  const denial = new Error('last synchronous host guard');
  const checkpoint = async () => {
    queueMicrotask(() => {
      revoked = true;
    });
  };
  const guard = () => {
    assert.equal(revoked, true);
    throw denial;
  };
  await assert.rejects(
    cli.read({
      profile: 'partner',
      expected,
      documentUrl: docUrl,
      beforeRead: checkpoint,
      assertRead: guard,
    }),
    (error: unknown) => error === denial,
  );
  revoked = false;
  await assert.rejects(
    cli.create({
      profile: 'partner',
      expected,
      folderUrl: 'https://sample.feishu.cn/drive/folder/folderToken',
      title: 'title',
      text: 'body',
      beforeDispatch: checkpoint,
      assertDispatch: guard,
    }),
    (error: unknown) => error === denial,
  );
  revoked = false;
  await assert.rejects(
    cli.append({
      profile: 'partner',
      expected,
      documentUrl: docUrl,
      baseRevision: 7,
      text: 'body',
      beforeDispatch: checkpoint,
      assertDispatch: guard,
    }),
    (error: unknown) => error === denial,
  );
  assert.equal(reads, 1);
  assert.equal(writes, 0);
});

test('no asynchronous boundary separates the synchronous guard from subprocess dispatch', async () => {
  let guardReturned = false;
  let yielded = false;
  const cli = new FeishuCli(
    fixture(async () => {
      assert.equal(guardReturned, true);
      assert.equal(yielded, false);
      return {
        stdout: JSON.stringify({
          ok: true,
          identity: 'user',
          data: {
            document: { document_id: 'docToken', revision_id: 7, content: 'original', url: docUrl },
          },
        }),
        stderr: '',
        exitCode: 0,
      };
    }),
  );
  const guard = () => {
    guardReturned = true;
    queueMicrotask(() => {
      yielded = true;
    });
  };
  await cli.read({ profile: 'partner', expected, documentUrl: docUrl, assertRead: guard });
  guardReturned = false;
  yielded = false;
  await cli.create({
    profile: 'partner',
    expected,
    folderUrl: 'https://sample.feishu.cn/drive/folder/folderToken',
    title: 'title',
    text: 'body',
    assertDispatch: guard,
  });
});

test('write receipts distinguish partial and unknown results and never retry malformed or failed dispatches', async () => {
  const createInput = {
    profile: 'partner',
    expected,
    folderUrl: 'https://sample.feishu.cn/drive/folder/folderToken',
    title: 'title',
    text: 'body',
  };
  const doc = { document_id: 'docToken', revision_id: 8, url: docUrl };
  for (const [data, outcome] of [
    [{ document: doc, result: 'partial_success' }, 'partial'],
    [{ document: doc, warnings: ['degraded'] }, 'partial'],
    [{ document: doc, result: 'failed' }, 'unknown'],
    [{ document: doc, result: 'unexpected' }, 'unknown'],
    [{ document: doc, warnings: 'malformed warning' }, 'unknown'],
    [{ document: { ...doc, url: 'https://evil.test/docx/docToken' } }, 'unknown'],
    [{ document: { ...doc, revision_id: '8' } }, 'unknown'],
  ] as const) {
    let count = 0;
    const cli = new FeishuCli(
      fixture(async () => {
        count++;
        return {
          exitCode: 0,
          stderr: 'SECRET',
          stdout: JSON.stringify({ ok: true, identity: 'user', data }),
        };
      }),
    );
    assert.equal((await cli.create(createInput)).status, outcome);
    assert.equal(count, 1);
  }
  for (const fail of [
    async () => ({ exitCode: 0, stderr: 'SECRET', stdout: 'not JSON SECRET' }),
    async () => {
      throw new Error('SECRET');
    },
  ]) {
    const cli = new FeishuCli(fixture(fail));
    await assert.rejects(cli.create(createInput), (error: unknown) => {
      assert.ok(error instanceof FeishuCliError);
      assert.equal(error.dispatched, true);
      assert.doesNotMatch(String(error), /SECRET/);
      return true;
    });
  }
  const denied = new FeishuCli(
    fixture(async () => ({ exitCode: 3, stderr: '{"error":"SECRET"}', stdout: '' })),
  );
  await assert.rejects(
    denied.create(createInput),
    (error: unknown) =>
      error instanceof FeishuCliError &&
      error.code === 'command_failed' &&
      error.dispatched &&
      !String(error).includes('SECRET'),
  );
});

test('invalid scope URLs, profile injection, oversized text, changed accounts and missing permissions never dispatch', async () => {
  let dispatched = 0;
  const business: FeishuCliRunner = async () => {
    dispatched++;
    throw new Error('must not dispatch');
  };
  const cli = new FeishuCli(fixture(business));
  for (const url of [
    'file:///secret',
    'http://sample.feishu.cn/docx/docToken',
    'https://sample.feishu.cn.evil.test/docx/docToken',
    'https://secret@sample.feishu.cn/docx/docToken',
    'https://sample.feishu.cn/wiki/docToken',
    'https://sample.feishu.cn:8443/docx/docToken',
    'https://nested.sample.feishu.cn/docx/docToken',
  ]) {
    await assert.rejects(
      cli.read({ profile: 'partner', expected, documentUrl: url }),
      (error: unknown) =>
        error instanceof FeishuCliError && error.code === 'invalid_input' && !error.dispatched,
    );
  }
  for (const profile of ['', '--profile=other', 'valid\n--as bot', 'a'.repeat(65)]) {
    await assert.rejects(
      cli.inspect(profile),
      (error: unknown) => error instanceof FeishuCliError && error.code === 'invalid_input',
    );
  }
  await assert.rejects(
    cli.create({
      profile: 'partner',
      expected,
      folderUrl: 'https://sample.feishu.cn/drive/folder/folderToken',
      title: 'Title',
      text: '中'.repeat(45000),
    }),
    (error: unknown) =>
      error instanceof FeishuCliError && error.code === 'invalid_input' && !error.dispatched,
  );
  const changed = new FeishuCli(fixture(business, { ...validIdentity, appId: 'cli_changed' }));
  await assert.rejects(
    changed.read({ profile: 'partner', expected, documentUrl: docUrl }),
    (error: unknown) =>
      error instanceof FeishuCliError && error.code === 'identity_changed' && !error.dispatched,
  );
  const noScope = new FeishuCli(
    fixture(business, {
      ...validIdentity,
      identities: { user: { ...validIdentity.identities.user, scope: '' } },
    }),
  );
  await assert.rejects(
    noScope.read({ profile: 'partner', expected, documentUrl: docUrl }),
    (error: unknown) =>
      error instanceof FeishuCliError && error.code === 'missing_scope' && !error.dispatched,
  );
  assert.equal(dispatched, 0);
});

test('profile discovery returns only supported profile names and display labels without credentials or implicit login', async () => {
  const calls: string[][] = [];
  const cli = new FeishuCli(async ({ args }) => {
    calls.push([...args]);
    return {
      exitCode: 0,
      stderr: '',
      stdout: args.includes('--version')
        ? 'lark-cli version 1.0.92'
        : JSON.stringify([
            {
              name: 'partner',
              brand: 'feishu',
              user: '测试\u0000用户',
              appSecret: 'SECRET',
              appId: 'cli_sample',
            },
            { name: 'lark', brand: 'lark', user: 'other' },
            { name: '--bad', brand: 'feishu', user: 'other' },
            { name: 'partner', brand: 'feishu', user: 'duplicate' },
          ]),
    };
  });
  assert.deepEqual(await cli.listProfiles(), [{ name: 'partner', label: '测试用户' }]);
  assert.deepEqual(calls, [['--version'], ['profile', 'list']]);
});

test('read errors stay sanitized preflight failures and cannot accept another document or an oversized source', async () => {
  for (const business of [
    async () => {
      throw new Error('SECRET');
    },
    async () => {
      throw new FeishuCliError('timeout', true);
    },
    async () => ({
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify({
        ok: true,
        identity: 'user',
        data: { document: { document_id: 'wrongToken', revision_id: 7, content: 'wrong' } },
      }),
    }),
    async () => ({
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify({
        ok: true,
        identity: 'user',
        data: {
          document: { document_id: 'docToken', revision_id: 7, content: '中'.repeat(45000) },
        },
      }),
    }),
  ]) {
    const cli = new FeishuCli(fixture(business));
    await assert.rejects(
      cli.read({ profile: 'partner', expected, documentUrl: docUrl }),
      (error: unknown) => {
        assert.ok(error instanceof FeishuCliError);
        assert.equal(error.dispatched, false);
        assert.doesNotMatch(String(error), /SECRET/);
        return true;
      },
    );
  }
});

test('append never presents a different document, missing outcome or unchanged revision as a successful receipt', async () => {
  for (const data of [
    {
      result: 'success',
      updated_blocks_count: 1,
      document: {
        document_id: 'otherToken',
        url: 'https://sample.feishu.cn/docx/otherToken',
        revision_id: 8,
      },
    },
    { updated_blocks_count: 1, document: { revision_id: 8 } },
    { result: 'success', updated_blocks_count: 1, document: { revision_id: 7 } },
  ]) {
    const cli = new FeishuCli(
      fixture(async ({ args }) => ({
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          ok: true,
          identity: 'user',
          data: args.includes('+fetch')
            ? { document: { document_id: 'docToken', revision_id: 7, content: 'original' } }
            : data,
        }),
      })),
    );
    assert.equal(
      (
        await cli.append({
          profile: 'partner',
          expected,
          documentUrl: docUrl,
          baseRevision: 7,
          text: 'body',
        })
      ).status,
      'unknown',
    );
  }
});

test('inspect refuses unverified users, foreign brands, unsupported versions and malformed output with sanitized reasons', async () => {
  const valid = {
    appId: 'cli_sample',
    brand: 'feishu',
    identities: {
      user: {
        available: true,
        verified: true,
        openId: 'ou_sample',
        userName: '测试',
        scope: 'docx:document:readonly',
      },
    },
  };
  for (const status of [
    { ...valid, brand: 'lark' },
    { ...valid, identities: { user: { ...valid.identities.user, verified: false } } },
    { ...valid, identities: { user: { ...valid.identities.user, available: false } } },
    { ...valid, identities: { bot: { verified: true, available: true } } },
    null,
  ]) {
    const cli = new FeishuCli(async ({ args }) => ({
      exitCode: 0,
      stderr: 'token SECRET',
      stdout: args.includes('--version') ? 'lark-cli version 1.0.92' : JSON.stringify(status),
    }));
    const result = await cli.inspect('partner');
    assert.equal(result.identity, undefined);
    assert.ok(result.reason);
    assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  }
  const old = new FeishuCli(async () => ({
    stdout: 'lark-cli version 1.0.91',
    stderr: '',
    exitCode: 0,
  }));
  assert.deepEqual(await old.inspect('partner'), {
    installed: true,
    version: '1.0.91',
    reason: '飞书连接组件版本不兼容，请更新 KodaX Space。',
  });
  const missing = new FeishuCli(async () => {
    throw new FeishuCliError('cli_missing', false);
  });
  assert.deepEqual(await missing.inspect('partner'), {
    installed: false,
    reason: '飞书连接组件不可用，请更新或重新安装 KodaX Space。',
  });
});
