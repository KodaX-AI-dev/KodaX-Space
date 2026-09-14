import {
  partnerConnectorResourceKey,
  partnerConnectorTokenSchema,
} from '@kodax-space/space-ipc-schema';
import {
  createApiCredentialConnector,
  type ApiConnectorOptions,
} from './api-credential-connector.js';
import { createApiHttp, apiObject, apiText, apiBody } from './api-http.js';
import { ReadConnectorError } from './read-connector.js';

export function createSlackConnector(options: ApiConnectorOptions) {
  const request = createApiHttp(options.fetchFn);
  const headers = (token: string) => ({
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  });
  return createApiCredentialConnector(
    {
      id: 'slack-mcp', // Retain persisted adapter IDs; transport is the official Web API.
      inputKind: 'slack_token',
      parse: (value) => {
        const parsed = partnerConnectorTokenSchema.parse(value);
        if (!/^xox[bp]-[A-Za-z0-9-]+$/u.test(parsed.token))
          throw new ReadConnectorError('authorization_failed');
        return parsed;
      },
      authenticate: async ({ token }, signal) => {
        const result = await request(
          'https://slack.com/api/auth.test',
          { method: 'POST', headers: headers(token) },
          { signal },
        );
        const body = apiObject(result.body);
        if (body.ok !== true) throw new ReadConnectorError('authorization_failed');
        const workspace = apiText(body.url, 256);
        if (!/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.slack\.com\/$/u.test(workspace))
          throw new ReadConnectorError('invalid_response');
        const authorityId = apiText(body.team_id, 64);
        const subjectId = apiText(body.user_id, 64);
        if (!/^T[A-Z0-9]{2,63}$/u.test(authorityId) || !/^[UW][A-Z0-9]{2,63}$/u.test(subjectId))
          throw new ReadConnectorError('invalid_response');
        const scopes = result.headers.get('x-oauth-scopes');
        if (
          scopes !== null &&
          !scopes
            .split(/[,\s]+/u)
            .some((scope) =>
              ['channels:history', 'groups:history', 'im:history', 'mpim:history'].includes(scope),
            )
        )
          throw new ReadConnectorError('permission_missing');
        return {
          token,
          workspace,
          identity: { authorityId, subjectId, label: apiText(body.team, 160) },
        };
      },
      read: async (session, input) => {
        if (
          input.documentUrl.startsWith('https://') &&
          new URL(input.documentUrl).origin !== new URL(session.workspace).origin
        )
          throw new ReadConnectorError('invalid_resource');
        const key = partnerConnectorResourceKey('slack-mcp', input.documentUrl)!;
        const [channel, ts] = key.split('/');
        const query = new URLSearchParams({
          channel: channel!,
          latest: ts!,
          inclusive: 'true',
          limit: '1',
        });
        const { body: raw } = await request(
          `https://slack.com/api/conversations.history?${query}`,
          { headers: headers(session.token) },
          { guard: input },
        );
        const body = apiObject(raw);
        if (body.ok !== true)
          throw new ReadConnectorError(
            body.error === 'missing_scope'
              ? 'permission_missing'
              : body.error === 'ratelimited'
                ? 'rate_limited'
                : 'read_failed',
          );
        if (!Array.isArray(body.messages) || body.messages.length !== 1)
          throw new ReadConnectorError('read_failed');
        const message = apiObject(body.messages[0]);
        if (message.ts !== ts) throw new ReadConnectorError('invalid_response');
        const content = apiBody(message.text);
        if (!content && !Array.isArray(message.files) && !Array.isArray(message.attachments))
          throw new ReadConnectorError('invalid_response');
        return {
          documentId: key,
          url: input.documentUrl,
          revision: 0,
          title: `Slack · ${channel} · ${ts}`,
          content: `Message: ${ts}\nChannel: ${channel}\n\n${content}\n\n[单条消息快照；不含线程回复、附件正文和交互块。]`,
        };
      },
    },
    options,
  );
}
