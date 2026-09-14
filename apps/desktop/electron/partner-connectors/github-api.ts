import {
  partnerConnectorResourceKey,
  partnerConnectorTokenSchema,
} from '@kodax-space/space-ipc-schema';
import {
  createApiCredentialConnector,
  type ApiConnectorOptions,
} from './api-credential-connector.js';
import { createApiHttp, apiObject, apiText, apiBody, apiNumber } from './api-http.js';
import { ReadConnectorError } from './read-connector.js';

export function createGithubConnector(options: ApiConnectorOptions) {
  const request = createApiHttp(options.fetchFn);
  const headers = (token: string) => ({
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
    'User-Agent': 'KodaX-Space-Partner',
  });
  return createApiCredentialConnector(
    {
      id: 'github-api',
      inputKind: 'github_token',
      parse: (value) => partnerConnectorTokenSchema.parse(value),
      authenticate: async ({ token }, signal) => {
        const { body: raw } = await request(
          'https://api.github.com/user',
          { headers: headers(token) },
          { signal },
        );
        const body = apiObject(raw);
        const id = apiNumber(body.id);
        if (id < 1) throw new ReadConnectorError('invalid_response');
        return {
          token,
          identity: {
            authorityId: 'github.com',
            subjectId: String(id),
            label: apiText(body.login, 160),
          },
        };
      },
      read: async (session, input) => {
        const key = partnerConnectorResourceKey('github-api', input.documentUrl)!;
        const [owner, repo, kind, number] = key.split('/');
        const repository = `${owner}/${repo}`;
        const endpoint = `https://api.github.com/repos/${repository}`;
        const route = kind
          ? `${endpoint}/${kind === 'pull' ? 'pulls' : 'issues'}/${number}`
          : endpoint;
        const { body: raw } = await request(
          route,
          { headers: headers(session.token) },
          { guard: input },
        );
        const body = apiObject(raw);
        if (apiText(body.html_url, 512).toLowerCase() !== input.documentUrl.toLowerCase())
          throw new ReadConnectorError('invalid_response');
        if (kind) {
          if (String(apiNumber(body.number)) !== number || (kind === 'issues' && body.pull_request))
            throw new ReadConnectorError('invalid_response');
          const title = apiText(body.title);
          return {
            documentId: key,
            url: input.documentUrl,
            title,
            revision: 0,
            content: [
              `${kind === 'pull' ? 'Pull request' : 'Issue'}: ${repository} #${number}`,
              `Title: ${title}`,
              `State: ${apiText(body.state, 32)}`,
              kind === 'pull' ? `Merged: ${body.merged === true}` : '',
              '',
              apiBody(body.body),
              '',
              '[标题、状态和正文快照；不含评论、diff、检查结果或附件正文。]',
            ].join('\n'),
          };
        }
        if (apiText(body.full_name, 160).toLowerCase() !== repository.toLowerCase())
          throw new ReadConnectorError('invalid_response');
        const { body: readme } = await request(
          `${endpoint}/readme`,
          { headers: headers(session.token) },
          { guard: input, allowNotFound: true },
        );
        let content = 'README 不可用（可能不存在或当前令牌无权读取）。';
        if (readme) {
          if (
            readme.type !== 'file' ||
            readme.encoding !== 'base64' ||
            typeof readme.content !== 'string'
          )
            throw new ReadConnectorError('invalid_response');
          const encoded = readme.content.replace(/[\r\n]/gu, '');
          if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded))
            throw new ReadConnectorError('invalid_response');
          const bytes = Buffer.from(encoded, 'base64');
          if (bytes.length !== apiNumber(readme.size))
            throw new ReadConnectorError('resource_too_large');
          try {
            content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          } catch {
            throw new ReadConnectorError('invalid_response');
          }
        }
        return {
          documentId: key,
          url: input.documentUrl,
          title: repository,
          revision: 0,
          content: [
            `Repository: ${repository}`,
            apiBody(body.description),
            '',
            'README (default branch):',
            content,
            '',
            '[仓库说明及默认分支 README；不含其他文件、Issue、PR 或完整代码库。]',
          ].join('\n'),
        };
      },
    },
    options,
  );
}
