// Yap Corp brand constants — single source of truth for the studio name in
// code. See docs/NAMING.md for the full nomenclature.
export const YAP_CORP = {
  /** Studio / publisher name, for meta tags, manifests and legal lines. */
  studio: 'Yap Corp',
  /** Lowercase vendor slug: analytics vendor, meta tags, asset namespaces. */
  vendor: 'yap-corp',
  /** Prefix for every localStorage / IndexedDB key (replaces the spec's `pc1:`). */
  storagePrefix: 'yapcorp:',
  /** npm package scope: @yapcorp/perfect-crime. */
  packageName: '@yapcorp/perfect-crime',
  /** Game version, mirrored in package.json. */
  version: '0.1.0',
} as const;
