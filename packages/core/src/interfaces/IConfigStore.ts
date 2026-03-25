export interface IConfigStore {
  /**
   * Returns the current resolved configuration.
   */
  getConfig(): any | null; // To be typed precisely when config schemas are moved

  /**
   * Saves and overwrites the configuration.
   */
  saveConfig(newConfig: any): void;

  /**
   * Register a listener for when the underlying config changes (e.g. file modified).
   */
  on(event: "configChanged", listener: (config: any) => void): this;
}
