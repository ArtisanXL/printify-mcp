/**
 * Hand-maintained judgement the Spec Snapshot cannot express. Every key that names an
 * `operationId` must match one in the spec, otherwise the generator fails.
 *
 * Holds every human judgement call: name overrides, Write Tool exceptions, destructive
 * additions, Paid Tool marks and sales-channel-only notes.
 */
export interface Overrides {
  /** operationId -> Tool name, for operationIds too long for MCP clients. */
  nameOverrides: Record<string, string>;
  /** Spec tag -> Toolset name, where snake_case of the tag is not wanted. */
  toolsetOverrides: Record<string, string>;
  /** operationIds of non-GET Operations that do not change state (read-only Tools). */
  readOnlyExceptions: string[];
  /** operationIds that get `destructiveHint: true` although their method is not DELETE. */
  destructive: string[];
  /** operationIds of Paid Tools (can charge the account; also destructive). */
  paid: string[];
  /** operationId -> sentence appended to the description. */
  notes: Record<string, string>;
}

const SALES_CHANNEL_NOTE =
  "Only for custom sales channel integrations; regular merchants should not call this.";

export const overrides: Overrides = {
  nameOverrides: {
    retrieveAListOfAllPrintProvidersThatFulfillOrdersForASpecificBlueprint:
      "list_blueprint_print_providers",
    retrieveAListOfVariantsOfABlueprintFromASpecificPrintProvider: "list_blueprint_variants",
  },
  toolsetOverrides: {
    "V2 Catalog Blueprints": "catalog",
  },
  readOnlyExceptions: ["calculateTheShippingCostOfAnOrder"],
  destructive: ["cancelAnOrder", "cancelAnOrderLineItem", "archiveAnUploadedImage"],
  paid: ["submitAnOrder", "submitAPrintifyExpressOrder", "sendAnExistingOrderToProduction"],
  notes: {
    setProductPublishStatusToSucceeded: SALES_CHANNEL_NOTE,
    setProductPublishStatusToFailed: SALES_CHANNEL_NOTE,
    notifyThatAProductHasBeenUnpublished: SALES_CHANNEL_NOTE,
  },
};
