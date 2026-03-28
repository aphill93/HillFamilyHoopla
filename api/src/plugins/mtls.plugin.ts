import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../config.js";

// ─── mTLS Plugin ─────────────────────────────────────────────────────────────
//
// Mutual TLS (mTLS) is used by the iOS client to authenticate itself to the API
// at the transport layer. The server presents its certificate, and the client
// presents a client certificate signed by the app's own CA.
//
// Setup:
//   1. Generate a CA key pair:
//      openssl genrsa -out certs/ca.key 4096
//      openssl req -x509 -new -key certs/ca.key -days 3650 -out certs/ca.crt
//
//   2. Generate a server key pair signed by the CA:
//      openssl genrsa -out certs/server.key 2048
//      openssl req -new -key certs/server.key -out certs/server.csr
//      openssl x509 -req -in certs/server.csr -CA certs/ca.crt \
//        -CAkey certs/ca.key -CAcreateserial -days 825 -out certs/server.crt
//
//   3. Distribute ca.crt + client.p12 to the iOS app bundle.
//
// Note: In development (MTLS_ENABLED=false) this plugin is a no-op.
// When MTLS_ENABLED=true the server must be started with HTTPS/TLS.

async function mtlsPlugin(fastify: FastifyInstance): Promise<void> {
  if (!config.mtls.enabled) {
    fastify.log.info("[mTLS] mTLS disabled — skipping certificate setup");
    return;
  }

  fastify.log.info("[mTLS] mTLS enabled — configuring client certificate verification");

  // Load the CA cert once so we can verify client certs on every request
  let caCert: Buffer;
  try {
    caCert = readFileSync(resolve(config.mtls.caCertPath));
  } catch (err) {
    throw new Error(
      `[mTLS] Cannot read CA certificate at ${config.mtls.caCertPath}: ${String(err)}`
    );
  }

  /**
   * preHandler hook that verifies the client certificate on every request.
   *
   * When the server is configured with `requestCert: true` (done in index.ts
   * via fastify's `https` option), Node.js makes the peer certificate
   * available via `req.socket.getPeerCertificate()`.
   */
  fastify.addHook("onRequest", async (req, reply) => {
    const socket = req.socket as typeof req.socket & {
      getPeerCertificate?: (detailed?: boolean) => {
        authorized?: boolean;
        subject?: { CN?: string };
        fingerprint?: string;
        valid_to?: string;
      };
      authorized?: boolean;
    };

    if (typeof socket.getPeerCertificate !== "function") {
      fastify.log.warn("[mTLS] getPeerCertificate not available on socket");
      await reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: "Client certificate required",
      });
      return;
    }

    const cert = socket.getPeerCertificate(false);

    if (!cert || !Object.keys(cert).length) {
      await reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Client certificate not provided",
      });
      return;
    }

    if (!socket.authorized) {
      fastify.log.warn("[mTLS] Client certificate rejected", {
        subject: cert.subject,
        fingerprint: cert.fingerprint,
      });
      await reply.status(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Client certificate is not trusted",
      });
      return;
    }

    // Optionally verify certificate expiry ourselves for belt-and-suspenders
    if (cert.valid_to) {
      const expiresAt = new Date(cert.valid_to);
      if (expiresAt < new Date()) {
        await reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Client certificate has expired",
        });
        return;
      }
    }

    fastify.log.debug("[mTLS] Client certificate verified", {
      cn: cert.subject?.CN,
      fingerprint: cert.fingerprint,
    });
  });
}

export default fp(mtlsPlugin, { name: "mtls-plugin" });
