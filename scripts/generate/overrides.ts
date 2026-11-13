/**
 * Hand-maintained judgement the Spec Snapshot cannot express. Every key that names an
 * `operationId` must match one in the spec, otherwise the generator fails.
 *
 * Later tickets extend this file (Write Tool exceptions, destructive additions, Paid Tool
 * marks, sales-channel-only notes).
 */
export interface Overrides {
  /** operationId -> Tool name, for operationIds too long for MCP clients. */
  nameOverrides: Record<string, string>;
  /** Spec tag -> Toolset name, where snake_case of the tag is not wanted. */
  toolsetOverrides: Record<string, string>;
}

export const overrides: Overrides = {
  nameOverrides: {
    retrieveAListOfAllPrintProvidersThatFulfillOrdersForASpecificBlueprint:
      "list_blueprint_print_providers",
    retrieveAListOfVariantsOfABlueprintFromASpecificPrintProvider: "list_blueprint_variants",
  },
  toolsetOverrides: {
    "V2 Catalog Blueprints": "catalog",
  },
};
