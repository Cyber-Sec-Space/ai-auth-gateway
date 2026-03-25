export interface ISecretStore {
  /**
   * Resolves a secret value based on a given URI or syntax.
   * e.g., "$MY_ENV_VAR" handles environment variables.
   * e.g., "keytar://service/account" handles keychain lookups.
   */
  resolveSecret(uri: string): Promise<string | undefined>;
}
