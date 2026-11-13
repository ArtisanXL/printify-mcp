# Printify MCP

An MCP server that exposes the Printify Public API to AI agents as callable tools.

## Language

**Operation**:
A single Printify Public API endpoint + HTTP method, identified by its `operationId` in the Printify spec.
_Avoid_: Endpoint, route, API call

**Tool**:
The MCP-facing exposure of exactly one Operation, named as the snake_case form of its `operationId` unless that name is too long for MCP clients.
_Avoid_: Command, action, function

**Toolset**:
A named group of Tools that a user can enable or disable as a unit.
_Avoid_: Category, module, tag

**Spec Snapshot**:
The copy of Printify's OpenAPI document kept in this repo, from which all Tools are derived.
_Avoid_: Schema, swagger

**Write Tool**:
A Tool whose Operation changes Printify state (create, update, delete, or trigger an action).
_Avoid_: Mutation, unsafe tool

**Paid Tool**:
A Write Tool whose Operation can charge the Printify account (e.g. submitting an order or sending it to production).
_Avoid_: Costly tool, billing tool

**Read-only Mode**:
The default server mode, in which no Write Tools are offered.
_Avoid_: Safe mode, dry run
