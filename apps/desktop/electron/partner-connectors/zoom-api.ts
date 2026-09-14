import {
  partnerConnectorResourceKey,
  partnerConnectorZoomAccountSchema,
} from '@kodax-space/space-ipc-schema';
import {
  createApiCredentialConnector,
  type ApiConnectorOptions,
} from './api-credential-connector.js';
import { createApiHttp, apiObject, apiText, apiBody, apiNumber } from './api-http.js';
import { ReadConnectorError } from './read-connector.js';

export function createZoomConnector(options: ApiConnectorOptions) {
  const request = createApiHttp(options.fetchFn);
  return createApiCredentialConnector(
    {
      id: 'zoom-mcp',
      inputKind: 'zoom_account',
      parse: (value) => partnerConnectorZoomAccountSchema.parse(value),
      authenticate: async (credentials, signal) => {
        const { body: raw } = await request(
          'https://zoom.us/oauth/token',
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              grant_type: 'account_credentials',
              account_id: credentials.accountId,
            }).toString(),
          },
          { signal },
        );
        const body = apiObject(raw);
        const token = apiText(body.access_token, 32768);
        if (
          /\s/u.test(token) ||
          String(body.token_type).toLowerCase() !== 'bearer' ||
          apiNumber(body.expires_in) < 1
        )
          throw new ReadConnectorError('invalid_response');
        const scopes = apiText(body.scope, 8192).split(/\s+/u);
        if (
          !scopes.some((scope) =>
            ['meeting:read:meeting:admin', 'meeting:read:admin'].includes(scope),
          )
        )
          throw new ReadConnectorError('permission_missing');
        return {
          token,
          identity: {
            authorityId: credentials.accountId,
            subjectId: credentials.clientId,
            label: `Zoom · ${credentials.accountId}`,
          },
        };
      },
      read: async (session, input) => {
        const id = partnerConnectorResourceKey('zoom-mcp', input.documentUrl)!;
        const { body: raw } = await request(
          `https://api.zoom.us/v2/meetings/${id}`,
          { headers: { Authorization: `Bearer ${session.token}`, Accept: 'application/json' } },
          { guard: input },
        );
        const body = apiObject(raw);
        if (String(apiNumber(body.id)) !== id) throw new ReadConnectorError('invalid_response');
        const title = apiText(body.topic);
        // Never project start_url, passwords, registrant tokens, or password-bearing join URLs.
        const content = [
          `Meeting: ${id}`,
          `Topic: ${title}`,
          body.start_time
            ? `Start: ${apiText(body.start_time, 100)}`
            : 'Start: recurring / unspecified',
          body.timezone ? `Timezone: ${apiText(body.timezone, 100)}` : '',
          body.duration === undefined ? '' : `Duration: ${apiNumber(body.duration)} min`,
          '',
          apiBody(body.agenda),
          '',
          '[会议基本信息快照；不含参会者、录制、转录或主持链接。]',
        ]
          .filter(Boolean)
          .join('\n');
        return { documentId: id, url: input.documentUrl, title, content, revision: 0 };
      },
    },
    options,
  );
}
