import path from 'node:path';
import { getSpaceDataDir } from '../kodax/data-paths.js';
import { SpaceExtensionStore } from './store.js';
import { SpaceExpertCatalog } from './experts.js';

let extensionStore: SpaceExtensionStore | undefined;
let expertCatalog: SpaceExpertCatalog | undefined;

/** Lazy construction performs no discovery, disk writes, or third-party code execution. */
export function getSpaceExtensionStore(): SpaceExtensionStore {
  return (extensionStore ??= new SpaceExtensionStore(path.join(getSpaceDataDir(), 'extensions')));
}

export function getSpaceExpertCatalog(): SpaceExpertCatalog {
  return (expertCatalog ??= new SpaceExpertCatalog(
    getSpaceExtensionStore(),
    path.join(getSpaceDataDir(), 'extension-data'),
  ));
}
