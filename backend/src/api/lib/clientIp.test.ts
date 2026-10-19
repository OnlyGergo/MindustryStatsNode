import { describe, expect, test } from 'bun:test';
import { isSelfRequest, resolveClient, type ProxyTrust } from './clientIp.js';

const server = (address: string) => ({ requestIP: () => ({ address }) });

function req(xff?: string): Request {
  const headers = new Headers();
  if (xff !== undefined) headers.set('x-forwarded-for', xff);
  return new Request('http://localhost/api/servers', { headers });
}

const local: ProxyTrust = { proxies: new Set(['127.0.0.1', '::1']), extraHops: 0 };
const behindCloudflare: ProxyTrust = { proxies: new Set(['127.0.0.1']), extraHops: 1 };

describe('resolveClient', () => {
  test('uses the rightmost X-Forwarded-For entry from a trusted proxy', () => {
    expect(resolveClient(req('6.6.6.6, 1.2.3.4'), server('127.0.0.1'), local))
      .toEqual({ ip: '1.2.3.4', untrustedPeer: false });
  });

  test('skips the configured outer hops', () => {
    expect(resolveClient(req('6.6.6.6, 1.2.3.4, 104.16.0.1'), server('127.0.0.1'), behindCloudflare).ip)
      .toBe('1.2.3.4');
    // Bypassed Cloudflare: Caddy overwrote the header with the single real peer.
    expect(resolveClient(req('5.5.5.5'), server('127.0.0.1'), behindCloudflare).ip).toBe('5.5.5.5');
  });

  test('ignores X-Forwarded-For from an untrusted peer, even a private one', () => {
    expect(resolveClient(req('1.2.3.4'), server('8.8.8.8'), local))
      .toEqual({ ip: '8.8.8.8', untrustedPeer: true });
    expect(resolveClient(req('1.2.3.4'), server('10.0.0.5'), local))
      .toEqual({ ip: '10.0.0.5', untrustedPeer: true });
  });

  test('normalises IPv4-mapped peers', () => {
    expect(resolveClient(req('1.2.3.4'), server('::ffff:127.0.0.1'), local).ip).toBe('1.2.3.4');
  });
});

describe('isSelfRequest', () => {
  test('loopback without a forwarded header is this process', () => {
    expect(isSelfRequest(req(), server('127.0.0.1'))).toBe(true);
    expect(isSelfRequest(req(), server('::1'))).toBe(true);
  });

  test('loopback traffic relayed by a local proxy is not', () => {
    expect(isSelfRequest(req('1.2.3.4'), server('127.0.0.1'))).toBe(false);
  });

  test('a remote peer is not', () => {
    expect(isSelfRequest(req(), server('8.8.8.8'))).toBe(false);
  });
});
