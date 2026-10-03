import { generateKeyPairSync, verify, createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  connectMuseKey,
  inspectMusePublicKey,
  museWrite,
} from "../src/features/qa/museBrowserKey";
const field = (v: Buffer) => {
  const n = Buffer.alloc(4);
  n.writeUInt32BE(v.length);
  return Buffer.concat([n, v]);
};
it("shows the exact supplied OpenSSH fingerprint", async () => {
  const result = await inspectMusePublicKey(
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINYZy72OJGCrypyIGsbsN0eqcrjeeqrJ+ZwuCye7+7b3 muse-qa-writer",
  );
  expect(result.fingerprint).toBe(
    "SHA256:6cyhnqQS0FA8R8kDxav9GUZgijkQx5QRd5DYb+Qs+E4",
  );
});
it("connects only locally and signs an exact narrow request without sending private bytes", async () => {
  const pair = generateKeyPairSync("ed25519");
  const raw = pair.publicKey
    .export({ format: "der", type: "spki" })
    .subarray(-32);
  const seed = pair.privateKey
    .export({ format: "der", type: "pkcs8" })
    .subarray(-32);
  const wire = Buffer.concat([field(Buffer.from("ssh-ed25519")), field(raw)]);
  const checks = Buffer.alloc(8);
  checks.writeUInt32BE(42, 0);
  checks.writeUInt32BE(42, 4);
  const privateBlock = Buffer.concat([
    checks,
    field(Buffer.from("ssh-ed25519")),
    field(raw),
    field(Buffer.concat([seed, raw])),
    field(Buffer.from("independently synthetic test")),
  ]);
  const count = Buffer.alloc(4);
  count.writeUInt32BE(1);
  const file = Buffer.concat([
    Buffer.from("openssh-key-v1\0"),
    field(Buffer.from("none")),
    field(Buffer.from("none")),
    field(Buffer.alloc(0)),
    count,
    field(wire),
    field(privateBlock),
  ]);
  const text =
    "-----BEGIN OPENSSH PRIVATE KEY-----\n" +
    file.toString("base64") +
    "\n-----END OPENSSH PRIVATE KEY-----\n";
  const fetchMock = vi.fn(async (_path: string, options: RequestInit) => {
    const headers = options.headers as Record<string, string>;
    const body = String(options.body);
    const canonical = [
      "POST",
      "/qa/api/verdict",
      headers["X-Muse-Timestamp"],
      headers["X-Muse-Nonce"],
      createHash("sha256").update(body).digest("hex"),
    ].join("\n");
    expect(
      verify(
        null,
        Buffer.from(canonical),
        pair.publicKey,
        Buffer.from(headers["X-Muse-Signature"], "base64url"),
      ),
    ).toBe(true);
    expect(options.credentials).toBe("omit");
    expect(body).not.toContain(seed.toString("base64"));
    return new Response(JSON.stringify({ receipt_id: "synthetic-receipt" }), {
      status: 201,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  try {
    const connection = await connectMuseKey(text);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(connection.key.extractable).toBe(false);
    expect(connection.fingerprint).toBe(
      "SHA256:" +
        createHash("sha256").update(wire).digest("base64").replace(/=+$/, ""),
    );
    await expect(museWrite(connection, "clinic/create", {})).rejects.toThrow(
      "Unsupported QA action",
    );
    await museWrite(connection, "verdict", {
      workflow_id: "WF-001",
      verdict: "pass",
      build_pin: "a".repeat(40),
      evidence: [{ kind: "observation", text: "Synthetic observation" }],
      idempotency_key: "test-receipt-001",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
