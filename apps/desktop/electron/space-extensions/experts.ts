import { randomUUID } from 'node:crypto';
import {
  spaceExpertDefinitionSchema,
  spaceExpertRefSchema,
  spaceExpertSaveInputSchema,
  type PartnerExpertSnapshotT,
  type SpaceExpertDefinitionT,
  type SpaceExpertRefT,
  type SpaceExpertSaveInputT,
  type SpaceExtensionManifestT,
} from '@kodax-space/space-ipc-schema';
import type { SpaceExtensionStore } from './store.js';
import { UserExpertStore } from './user-experts.js';

/** Resolves immutable per-session expert snapshots from enabled, verified packages. */
export class SpaceExpertCatalog {
  private readonly users: UserExpertStore;

  constructor(
    private readonly store: SpaceExtensionStore,
    userDataRoot: string,
  ) {
    this.users = new UserExpertStore(userDataRoot);
  }

  async list(extensionId: string): Promise<SpaceExpertDefinitionT[]> {
    return this.users.serialize(extensionId, async () => {
      const manifest = await this.store.getManifest(extensionId);
      return (await this.definitions(manifest)).filter((expert) => !expert.retired);
    });
  }

  async resolve(ref: SpaceExpertRefT): Promise<PartnerExpertSnapshotT> {
    ref = spaceExpertRefSchema.parse(ref);
    return this.users.serialize(ref.extensionId, async () => {
      const manifest = await this.store.getManifest(ref.extensionId);
      const expert = (await this.definitions(manifest)).find((entry) => entry.id === ref.expertId);
      if (!expert) throw new Error('The selected expert is no longer available in this extension');
      if (expert.retired)
        throw new Error('This expert is retired; choose a current expert from the library');
      if (expert.revision !== ref.revision) {
        throw new Error('Expert revision changed; refresh the plugin library before selecting it');
      }
      return {
        extensionId: manifest.id,
        extensionVersion: manifest.version,
        expert,
        ...(ref.useSkill === undefined ? {} : { useSkill: ref.useSkill }),
      };
    });
  }

  async requireAvailable(snapshot: PartnerExpertSnapshotT): Promise<void> {
    return this.users.serialize(snapshot.extensionId, async () => {
      const current = await this.store.getManifest(snapshot.extensionId);
      if (!(await this.definitions(current)).some((entry) => entry.id === snapshot.expert.id)) {
        throw new Error('The session expert is no longer available in this extension');
      }
      // Deliberately keep the bound prompt/revision: an extension update is not user consent
      // to silently replace the expert persona in an existing conversation.
    });
  }

  async save(input: SpaceExpertSaveInputT): Promise<SpaceExpertDefinitionT> {
    input = spaceExpertSaveInputSchema.parse(input);
    return this.users.serialize(input.extensionId, async () => {
      const manifest = await this.store.getManifest(input.extensionId);
      const entries = await this.users.read(manifest.id);
      const user = entries.find(
        (entry) => entry.expert.id === input.expertId && entry.deletedAt === undefined,
      );
      let basedOn = user?.basedOn;
      let base: SpaceExpertDefinitionT | undefined;
      if (input.expertId !== undefined) {
        base = user?.expert ?? manifest.experts.find((expert) => expert.id === input.expertId);
        if (!base) throw new Error('The selected expert is no longer available in this extension');
        if (base.revision !== input.expectedRevision)
          throw new Error('Expert revision changed; refresh before saving');
        if (!user)
          basedOn = { extensionId: manifest.id, expertId: base.id, revision: base.revision };
      }
      const { category, workflow, ...values } = input.values;
      const expert = spaceExpertDefinitionSchema.parse({
        ...(base?.expertType === undefined ? {} : { expertType: base.expertType }),
        ...(category === undefined && base?.category !== undefined
          ? { category: base.category }
          : {}),
        ...(base?.listingType === undefined ? {} : { listingType: base.listingType }),
        ...(workflow === undefined && base?.workflow !== undefined
          ? { workflow: base.workflow }
          : {}),
        ...(workflow ? { workflow } : {}),
        ...(base?.capabilityGuide !== undefined ? { capabilityGuide: base.capabilityGuide } : {}),
        ...values,
        ...(typeof category === 'string' ? { category } : {}),
        id: user?.expert.id ?? `user.${randomUUID()}`,
        revision: user ? user.expert.revision + 1 : 1,
      });
      const now = Date.now();
      const updated = {
        expert,
        createdAt: user?.createdAt ?? now,
        updatedAt: now,
        ...(basedOn ? { basedOn } : {}),
      };
      await this.users.write(
        manifest.id,
        user ? entries.map((entry) => (entry === user ? updated : entry)) : [...entries, updated],
      );
      return expert;
    });
  }

  async delete(ref: SpaceExpertRefT): Promise<void> {
    ref = spaceExpertRefSchema.parse(ref);
    return this.users.serialize(ref.extensionId, async () => {
      const manifest = await this.store.getManifest(ref.extensionId);
      if (!ref.expertId.startsWith('user.')) throw new Error('Built-in experts cannot be deleted');
      const entries = await this.users.read(manifest.id);
      const entry = entries.find(
        (candidate) => candidate.expert.id === ref.expertId && candidate.deletedAt === undefined,
      );
      if (!entry) throw new Error('The selected expert is no longer available in this extension');
      if (entry.expert.revision !== ref.revision)
        throw new Error('Expert revision changed; refresh before deleting');
      entry.deletedAt = Date.now();
      entry.updatedAt = entry.deletedAt;
      await this.users.write(manifest.id, entries);
    });
  }

  private async definitions(manifest: SpaceExtensionManifestT): Promise<SpaceExpertDefinitionT[]> {
    const users = (await this.users.read(manifest.id)).filter(
      (entry) => entry.deletedAt === undefined,
    );
    return [...manifest.experts, ...users.map((entry) => entry.expert)];
  }
}
