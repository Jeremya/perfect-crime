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
  /**
   * Who to write to about the data, shown on the privacy page. Empty: the page
   * has no contact section. It must be set before any outside tester (H5).
   */
  contact: '',
  /** Game version, mirrored in package.json. */
  version: '0.1.0',
} as const;
