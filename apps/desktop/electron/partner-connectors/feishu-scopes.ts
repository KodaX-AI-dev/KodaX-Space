export const FEISHU_BASE_CREATE_SCOPES = [
  'base:app:create',
  'base:table:read',
  'base:table:create',
  'base:table:update',
  'base:table:delete',
] as const;

const FEISHU_DOCUMENT_SCOPES = [
  'docx:document:readonly',
  'docx:document:create',
  'docx:document:write_only',
] as const;

export const FEISHU_ONBOARDING_SCOPES = [
  ...FEISHU_DOCUMENT_SCOPES,
  ...FEISHU_BASE_CREATE_SCOPES,
] as const;
