// Client Postgres minimal (protocolul simplu, fără dependențe): folosit doar la /api/setup, ca să creeze tabelele
// și programările pg_cron fără ca omul să lipească SQL în dashboard. TLS + SCRAM-SHA-256 (ce cere Supabase), md5, cleartext.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';

export interface PgResult {
  rows: Record<string, string | null>[];
  notices: string[];
}

export interface PgClient {
  query(sql: string): Promise<PgResult>;
  end(): void;
}

interface Conn {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
}

export function parsePgUrl(url: string): Conn {
  const u = new URL(url);
  const sslmode = u.searchParams.get('sslmode');
  const host = u.hostname;
  const local = host === 'localhost' || host === '127.0.0.1';
  return {
    host,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '') || 'postgres'),
    ssl: sslmode ? sslmode !== 'disable' : !local,
  };
}

class Reader {
  private buf = Buffer.alloc(0);
  private waiters: (() => void)[] = [];
  private err: Error | null = null;
  push(b: Buffer): void {
    this.buf = Buffer.concat([this.buf, b]);
    this.wake();
  }
  fail(e: Error): void {
    this.err = e;
    this.wake();
  }
  private wake(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }
  async bytes(n: number): Promise<Buffer> {
    while (this.buf.length < n) {
      if (this.err) throw this.err;
      await new Promise<void>((r) => this.waiters.push(r));
    }
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }
  async message(): Promise<{ type: string; body: Buffer }> {
    const head = await this.bytes(5);
    const len = head.readInt32BE(1);
    const body = await this.bytes(len - 4);
    return { type: String.fromCharCode(head[0]!), body };
  }
}

function msg(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(5);
  head.write(type, 0, 'latin1');
  head.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([head, body]);
}

const cstr = (s: string) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])]);

function fields(body: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < body.length && body[i] !== 0) {
    const code = String.fromCharCode(body[i]!);
    const end = body.indexOf(0, i + 1);
    out[code] = body.toString('utf8', i + 1, end);
    i = end + 1;
  }
  return out;
}

const pgError = (body: Buffer) => {
  const f = fields(body);
  return new Error(`postgres: ${f.M ?? 'eroare'}${f.D ? ` (${f.D})` : ''}${f.C ? ` [${f.C}]` : ''}`);
};

const xor = (a: Buffer, b: Buffer) => Buffer.from(a.map((x, i) => x ^ b[i]!));

export async function connect(url: string, timeoutMs = 15000): Promise<PgClient> {
  const c = parsePgUrl(url);
  const reader = new Reader();
  let sock: net.Socket = net.connect({ host: c.host, port: c.port });
  sock.setTimeout(timeoutMs, () => sock.destroy(new Error('postgres: timeout')));
  await new Promise<void>((ok, ko) => {
    sock.once('connect', ok);
    sock.once('error', ko);
  });

  if (c.ssl) {
    // SSLRequest: serverul răspunde cu un singur octet, 'S' sau 'N'.
    const req = Buffer.alloc(8);
    req.writeInt32BE(8, 0);
    req.writeInt32BE(80877103, 4);
    const answer = await new Promise<string>((ok, ko) => {
      sock.once('data', (d: Buffer) => ok(String.fromCharCode(d[0]!)));
      sock.once('error', ko);
      sock.write(req);
    });
    if (answer !== 'S') throw new Error('postgres: serverul nu acceptă TLS');
    sock = tls.connect({ socket: sock, servername: net.isIP(c.host) ? undefined : c.host, rejectUnauthorized: false });
    await new Promise<void>((ok, ko) => {
      (sock as tls.TLSSocket).once('secureConnect', ok);
      sock.once('error', ko);
    });
  }
  sock.on('data', (d: Buffer) => reader.push(d));
  sock.on('error', (e) => reader.fail(e));
  sock.on('close', () => reader.fail(new Error('postgres: conexiune închisă')));

  // StartupMessage, protocol 3.0
  const params = Buffer.concat([cstr('user'), cstr(c.user), cstr('database'), cstr(c.database), cstr('client_encoding'), cstr('UTF8'), Buffer.from([0])]);
  const start = Buffer.alloc(8);
  start.writeInt32BE(params.length + 8, 0);
  start.writeInt32BE(196608, 4);
  sock.write(Buffer.concat([start, params]));

  // Autentificare
  let nonce = '';
  let scram: { salted: Buffer; authMessage: string } | null = null;
  for (;;) {
    const m = await reader.message();
    if (m.type === 'E') throw pgError(m.body);
    if (m.type === 'R') {
      const code = m.body.readInt32BE(0);
      if (code === 0) continue; // AuthenticationOk
      if (code === 3) sock.write(msg('p', cstr(c.password)));
      else if (code === 5) {
        const salt = m.body.subarray(4, 8);
        const inner = createHash('md5').update(c.password + c.user).digest('hex');
        sock.write(msg('p', cstr('md5' + createHash('md5').update(Buffer.concat([Buffer.from(inner), salt])).digest('hex'))));
      } else if (code === 10) {
        const mechs = m.body.subarray(4).toString('utf8').split('\0');
        if (!mechs.includes('SCRAM-SHA-256')) throw new Error(`postgres: autentificare nesuportată (${mechs.join(', ')})`);
        nonce = randomBytes(18).toString('base64');
        const first = `n,,n=*,r=${nonce}`;
        const firstBuf = Buffer.from(first, 'utf8');
        const len = Buffer.alloc(4);
        len.writeInt32BE(firstBuf.length, 0);
        sock.write(msg('p', Buffer.concat([cstr('SCRAM-SHA-256'), len, firstBuf])));
      } else if (code === 11) {
        const serverFirst = m.body.subarray(4).toString('utf8');
        const attrs = Object.fromEntries(serverFirst.split(',').map((kv) => [kv[0], kv.slice(2)]));
        const r = attrs.r ?? '';
        if (!r.startsWith(nonce)) throw new Error('postgres: nonce SCRAM invalid');
        const salted = pbkdf2Sync(c.password, Buffer.from(attrs.s ?? '', 'base64'), Number(attrs.i), 32, 'sha256');
        const clientKey = createHmac('sha256', salted).update('Client Key').digest();
        const storedKey = createHash('sha256').update(clientKey).digest();
        const withoutProof = `c=biws,r=${r}`;
        const authMessage = `n=*,r=${nonce},${serverFirst},${withoutProof}`;
        const signature = createHmac('sha256', storedKey).update(authMessage).digest();
        const proof = xor(clientKey, signature).toString('base64');
        scram = { salted, authMessage };
        sock.write(msg('p', Buffer.from(`${withoutProof},p=${proof}`, 'utf8')));
      } else if (code === 12) {
        if (!scram) throw new Error('postgres: SCRAM fără început');
        const serverKey = createHmac('sha256', scram.salted).update('Server Key').digest();
        const expected = createHmac('sha256', serverKey).update(scram.authMessage).digest('base64');
        const got = /v=([^,]+)/.exec(m.body.subarray(4).toString('utf8'))?.[1];
        if (got !== expected) throw new Error('postgres: semnătura serverului nu se potrivește');
      } else throw new Error(`postgres: metodă de autentificare ${code} nesuportată`);
      continue;
    }
    if (m.type === 'Z') break; // ReadyForQuery
    // S (parametri), K (cheie), N (notice): ignorate
  }

  let busy: Promise<unknown> = Promise.resolve();
  const run = async (sql: string): Promise<PgResult> => {
    sock.write(msg('Q', cstr(sql)));
    const rows: Record<string, string | null>[] = [];
    const notices: string[] = [];
    let cols: string[] = [];
    let error: Error | null = null;
    for (;;) {
      const m = await reader.message();
      if (m.type === 'T') {
        const n = m.body.readInt16BE(0);
        cols = [];
        let i = 2;
        for (let k = 0; k < n; k++) {
          const end = m.body.indexOf(0, i);
          cols.push(m.body.toString('utf8', i, end));
          i = end + 1 + 18;
        }
      } else if (m.type === 'D') {
        const n = m.body.readInt16BE(0);
        const row: Record<string, string | null> = {};
        let i = 2;
        for (let k = 0; k < n; k++) {
          const len = m.body.readInt32BE(i);
          i += 4;
          if (len === -1) row[cols[k] ?? String(k)] = null;
          else {
            row[cols[k] ?? String(k)] = m.body.toString('utf8', i, i + len);
            i += len;
          }
        }
        rows.push(row);
      } else if (m.type === 'E') error = pgError(m.body);
      else if (m.type === 'N') notices.push(fields(m.body).M ?? '');
      else if (m.type === 'Z') break;
    }
    if (error) throw error;
    return { rows, notices };
  };

  return {
    query(sql: string) {
      const p = busy.then(() => run(sql));
      busy = p.catch(() => undefined);
      return p;
    },
    end() {
      try {
        sock.write(msg('X', Buffer.alloc(0)));
      } catch {
        /* deja închis */
      }
      sock.end();
    },
  };
}

/** Literal SQL sigur pentru șiruri (doar pentru valori generate de server: URL, secret). */
export function lit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}
