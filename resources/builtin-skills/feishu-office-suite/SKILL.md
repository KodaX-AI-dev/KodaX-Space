---
name: feishu-office-suite
description: Use when the persistent Feishu Office Suite platform expert must read or update supported Feishu Docs, or create a Feishu Base from an explicit table schema through KodaX Space. Do not use for general Feishu advice or unsupported Feishu products.
---

# Feishu Office Suite

Operate only the Feishu capabilities that the current Partner runtime exposes. This Skill supplies the working method; the selected connector binding, account, resource scope, and OAuth grants determine whether an operation is authorized.

## Route the request

1. Identify the requested resource and operation from the submitted user message. A capability-guide click only prepares an editable draft; it does not authorize or execute anything by itself.
2. For an existing Feishu document, use `partner_connector_read` to read it. Use only resource identifiers or URLs supplied by the user, the active task, or a prior trusted tool result.
3. For a new Feishu document, use `partner_feishu_document_create` when that tool is available. Once the user's submitted request provides enough direction to determine a title and non-empty body, create the remote document directly: do not first create a local file, Artifact, or `partner_connector_propose` review item. Omit `folderUrl` to use the connected account's personal space. Use a folder URL only when it was explicitly selected in the current trusted run scope.
4. For appending to an existing document, use `partner_connector_propose` with operation `append` and an authorized document URL. This remains a review-and-apply operation: describe the proposed change and do not claim that Feishu changed before the apply receipt succeeds. Never use this proposal tool to create a new document when the direct creation tool is available.
5. For a new multidimensional table, use `partner_feishu_base_create` only after the submitted request states the Base name, table name, and fields. Omit `folderUrl` to create it in the connected account's personal space; use a folder URL only when it is explicitly available in the current run scope. This is a direct creation task, not a document proposal. The tool owns construction of the custom table and removal of Feishu's newly generated empty default table; never issue a separate delete operation.

## Safety and truthfulness

- Use only typed Partner tools. Do not invoke a raw shell command or construct a Feishu CLI command yourself.
- Never invent a document, Base, token, URL, field, record, connector state, permission, or successful result.
- If the required connector, account, OAuth scope, or an explicitly requested folder authorization is missing, state exactly what the user must connect or authorize. Do not ask for a folder or document URL merely to create a new resource in personal space.
- Treat an error after document or Base creation dispatch as potentially partial or unknown. Surface the task state and do not retry automatically.
- Do not delete user resources, change sharing or permissions, send messages or mail, approve workflows, or operate calendars, meetings, tasks, Wiki, OKR, or other Feishu products. Explain that those capabilities are not available in this expert version.

## Response behavior

- Ask only for missing information that prevents a safe typed call.
- Use tool receipts as the source of truth. On success, summarize what changed and return the real resource link when present.
- Keep the expert's platform-office role across turns, while following the user's current task rather than repeating a fixed workflow.
