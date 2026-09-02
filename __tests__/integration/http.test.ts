import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";

// This file builds and starts a REAL production Next.js server on a spare
// port and drives it with plain HTTP requests + independent per-role cookie
// jars, so it exercises the whole stack (routing, cookies, rendered HTML) —
// not just the lib/ functions the unit tests cover directly.
//
// It shells out to `next build` itself in beforeAll so `npm test` is
// self-sufficient without requiring a prior `npm run build`. vitest.config.ts
// sets fileParallelism:false so this only happens once and doesn't race any
// other integration file over the same spare port.

const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DB_PATH = path.join(PROJECT_ROOT, "data", `integration-${randomUUID()}.db`);

let server: ChildProcess;

class CookieJar {
  private cookie: string | null = null;

  capture(res: Response) {
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      this.cookie = setCookie.split(";")[0];
    }
  }

  async fetch(pathname: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("cookie", this.cookie);
    const res = await fetch(`${BASE_URL}${pathname}`, { ...init, headers, redirect: "manual" });
    this.capture(res);
    return res;
  }

  /** Creates a brand-new account (each test uses unique emails) and signs this jar in as it. */
  async signUp(displayName: string, email: string) {
    const res = await this.fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, email, password: "testpassword123" }),
    });
    const data = await res.json();
    return data.user as { id: string; display_name: string; email: string };
  }

  /** Signs this jar in to an existing account. */
  async signIn(email: string, password = "testpassword123") {
    const res = await this.fetch("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    return data.user as { id: string; display_name: string; email: string };
  }
}

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE_URL);
      if (res.ok || res.status === 404) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Server did not start in time");
}

beforeAll(async () => {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  execSync("npx next build", {
    cwd: PROJECT_ROOT,
    env: { ...process.env, SQLITE_DB_PATH: DB_PATH },
    stdio: "inherit",
  });

  // Invoke the local `next` binary directly (not via `npx`), which would
  // otherwise fork an extra wrapper process that doesn't reliably forward
  // the kill signal on to the actual server process in afterAll.
  const nextBin = path.join(PROJECT_ROOT, "node_modules", ".bin", "next");
  server = spawn(nextBin, ["start", "-p", String(PORT)], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, SQLITE_DB_PATH: DB_PATH },
    stdio: "inherit",
    detached: true,
  });

  await waitForServer();
}, 120000);

afterAll(async () => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
  }
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.unlinkSync(DB_PATH + suffix);
    } catch {
      // already gone
    }
  }
});

describe("HTTP integration", () => {
  it("runs the full join -> approve -> auto-close -> leave -> auto-reopen flow", async () => {
    const dmJar = new CookieJar();
    const playerJar = new CookieJar();
    const otherJar = new CookieJar();

    await dmJar.signUp("Flow DM", "flow-dm@example.com");
    const player = await playerJar.signUp("Flow Player", "flow-player@example.com");
    await otherJar.signUp("Flow Other", "flow-other@example.com");

    const createRes = await dmJar.fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Flow Campaign",
        description: "desc",
        system: "Flow System",
        capacity: 1,
      }),
    });
    expect(createRes.status).toBe(201);
    const { campaign } = await createRes.json();

    const joinRes = await playerJar.fetch(`/api/campaigns/${campaign.id}/join`, {
      method: "POST",
    });
    expect(joinRes.status).toBe(201);
    const { membership } = await joinRes.json();

    const approveRes = await dmJar.fetch(
      `/api/campaigns/${campaign.id}/requests/${membership.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      }
    );
    expect(approveRes.status).toBe(200);

    // Capacity 1 is now full -> auto-closed to new requests.
    const detailRes = await dmJar.fetch(`/api/campaigns/${campaign.id}`);
    const detail = await detailRes.json();
    expect(detail.campaign.accepting_requests).toBe(0);

    const blockedJoin = await otherJar.fetch(`/api/campaigns/${campaign.id}/join`, {
      method: "POST",
    });
    expect(blockedJoin.status).toBe(400);

    // Leaving re-opens it (auto-reopen).
    const leaveRes = await playerJar.fetch(`/api/campaigns/${campaign.id}/leave`, {
      method: "POST",
    });
    expect(leaveRes.status).toBe(200);

    const reopenedDetail = await (
      await dmJar.fetch(`/api/campaigns/${campaign.id}`)
    ).json();
    expect(reopenedDetail.campaign.accepting_requests).toBe(1);

    const secondJoin = await otherJar.fetch(`/api/campaigns/${campaign.id}/join`, {
      method: "POST",
    });
    expect(secondJoin.status).toBe(201);

    // sanity: the original player id was captured correctly
    expect(player.display_name).toBe("Flow Player");
  });

  it("enforces the private-access boundary at both the API and rendered-HTML layers", async () => {
    const dmJar = new CookieJar();
    const memberJar = new CookieJar();
    const pendingJar = new CookieJar();
    const leftJar = new CookieJar();
    const strangerJar = new CookieJar();

    await dmJar.signUp("Priv DM", "priv-dm@example.com");
    await memberJar.signUp("Priv Member", "priv-member@example.com");
    await pendingJar.signUp("Priv Pending", "priv-pending@example.com");
    await leftJar.signUp("Priv Left", "priv-left@example.com");
    await strangerJar.signUp("Priv Stranger", "priv-stranger@example.com");

    const { campaign } = await (
      await dmJar.fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Private Campaign",
          description: "desc",
          system: "Priv System",
          capacity: 5,
        }),
      })
    ).json();

    const memberMembership = await (
      await memberJar.fetch(`/api/campaigns/${campaign.id}/join`, { method: "POST" })
    ).json();
    await dmJar.fetch(`/api/campaigns/${campaign.id}/requests/${memberMembership.membership.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });

    const leftMembership = await (
      await leftJar.fetch(`/api/campaigns/${campaign.id}/join`, { method: "POST" })
    ).json();
    await dmJar.fetch(`/api/campaigns/${campaign.id}/requests/${leftMembership.membership.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    await leftJar.fetch(`/api/campaigns/${campaign.id}/leave`, { method: "POST" });

    await pendingJar.fetch(`/api/campaigns/${campaign.id}/join`, { method: "POST" });

    const secretNote = "TOP SECRET PARTY NOTE 12345";
    const notesRes = await dmJar.fetch(`/api/campaigns/${campaign.id}/notes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: secretNote }),
    });
    expect(notesRes.status).toBe(200);

    // API: notes endpoint status codes.
    expect((await dmJar.fetch(`/api/campaigns/${campaign.id}/notes`)).status).toBe(200);
    expect((await memberJar.fetch(`/api/campaigns/${campaign.id}/notes`)).status).toBe(200);
    expect((await pendingJar.fetch(`/api/campaigns/${campaign.id}/notes`)).status).toBe(403);
    expect((await leftJar.fetch(`/api/campaigns/${campaign.id}/notes`)).status).toBe(403);
    expect((await strangerJar.fetch(`/api/campaigns/${campaign.id}/notes`)).status).toBe(403);
    const signedOutRes = await fetch(`${BASE_URL}/api/campaigns/${campaign.id}/notes`);
    expect(signedOutRes.status).toBe(401);

    // Rendered HTML: the secret must never leak to an unauthorized viewer's page.
    const dmHtml = await (await dmJar.fetch(`/campaigns/${campaign.id}`)).text();
    const memberHtml = await (await memberJar.fetch(`/campaigns/${campaign.id}`)).text();
    const pendingHtml = await (await pendingJar.fetch(`/campaigns/${campaign.id}`)).text();
    const leftHtml = await (await leftJar.fetch(`/campaigns/${campaign.id}`)).text();
    const strangerHtml = await (await strangerJar.fetch(`/campaigns/${campaign.id}`)).text();
    const signedOutHtml = await (await fetch(`${BASE_URL}/campaigns/${campaign.id}`)).text();

    expect(dmHtml).toContain(secretNote);
    expect(memberHtml).toContain(secretNote);
    expect(pendingHtml).not.toContain(secretNote);
    expect(leftHtml).not.toContain(secretNote);
    expect(strangerHtml).not.toContain(secretNote);
    expect(signedOutHtml).not.toContain(secretNote);
  });

  it("fans out member_left_party on leave and party_notes_updated on a notes edit (6a/6b)", async () => {
    const dmJar = new CookieJar();
    const p1Jar = new CookieJar();
    const p2Jar = new CookieJar();
    const p3Jar = new CookieJar();

    await dmJar.signUp("Fanout DM", "fanout-dm@example.com");
    await p1Jar.signUp("Fanout P1", "fanout-p1@example.com");
    await p2Jar.signUp("Fanout P2", "fanout-p2@example.com");
    await p3Jar.signUp("Fanout P3", "fanout-p3@example.com");

    const { campaign } = await (
      await dmJar.fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Fanout Campaign",
          description: "",
          system: "Fanout System",
          capacity: 3,
        }),
      })
    ).json();

    for (const jar of [p1Jar, p2Jar, p3Jar]) {
      const { membership } = await (
        await jar.fetch(`/api/campaigns/${campaign.id}/join`, { method: "POST" })
      ).json();
      await dmJar.fetch(`/api/campaigns/${campaign.id}/requests/${membership.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
    }

    await p1Jar.fetch(`/api/campaigns/${campaign.id}/leave`, { method: "POST" });

    const p2Notifications = await (await p2Jar.fetch("/api/notifications?pageSize=50")).json();
    const p3Notifications = await (await p3Jar.fetch("/api/notifications?pageSize=50")).json();
    expect(
      p2Notifications.items.some((n: { type: string }) => n.type === "member_left_party")
    ).toBe(true);
    expect(
      p3Notifications.items.some((n: { type: string }) => n.type === "member_left_party")
    ).toBe(true);

    await p2Jar.fetch(`/api/campaigns/${campaign.id}/notes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "updated by p2" }),
    });
    const p3AfterNotes = await (await p3Jar.fetch("/api/notifications?pageSize=50")).json();
    const dmAfterNotes = await (await dmJar.fetch("/api/notifications?pageSize=50")).json();
    expect(
      p3AfterNotes.items.some((n: { type: string }) => n.type === "party_notes_updated")
    ).toBe(true);
    expect(
      dmAfterNotes.items.some((n: { type: string }) => n.type === "party_notes_updated")
    ).toBe(true);
  });

  it("mutes a notification type via the settings endpoint end-to-end (6d)", async () => {
    const dmJar = new CookieJar();
    const mutedJar = new CookieJar();
    const otherJar = new CookieJar();

    await dmJar.signUp("Mute DM", "mute-dm@example.com");
    await mutedJar.signUp("Mute Player", "mute-player@example.com");
    await otherJar.signUp("Mute Other", "mute-other@example.com");

    const { campaign } = await (
      await dmJar.fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Mute Campaign",
          description: "",
          system: "Mute System",
          capacity: 3,
        }),
      })
    ).json();

    for (const jar of [mutedJar, otherJar]) {
      const { membership } = await (
        await jar.fetch(`/api/campaigns/${campaign.id}/join`, { method: "POST" })
      ).json();
      await dmJar.fetch(`/api/campaigns/${campaign.id}/requests/${membership.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
    }

    const muteRes = await mutedJar.fetch("/api/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "party_notes_updated", enabled: false }),
    });
    expect(muteRes.status).toBe(200);

    const beforeUnread = (await (await mutedJar.fetch("/api/notifications")).json()).unreadCount;

    // Trigger the muted action: someone else edits notes.
    await otherJar.fetch(`/api/campaigns/${campaign.id}/notes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "muted-triggering edit" }),
    });

    const afterMutedTrigger = await (await mutedJar.fetch("/api/notifications?pageSize=50")).json();
    expect(afterMutedTrigger.unreadCount).toBe(beforeUnread);
    expect(
      afterMutedTrigger.items.some((n: { type: string }) => n.type === "party_notes_updated")
    ).toBe(false);

    // Another member (not muted) still got notified by the same edit.
    const otherPartyNotifications = await (
      await dmJar.fetch("/api/notifications?pageSize=50")
    ).json();
    expect(
      otherPartyNotifications.items.some(
        (n: { type: string }) => n.type === "party_notes_updated"
      )
    ).toBe(true);

    // An unmuted action still reaches the muted user normally.
    await otherJar.fetch(`/api/campaigns/${campaign.id}/leave`, { method: "POST" });
    const afterUnmutedTrigger = await (
      await mutedJar.fetch("/api/notifications?pageSize=50")
    ).json();
    expect(
      afterUnmutedTrigger.items.some((n: { type: string }) => n.type === "member_left_party")
    ).toBe(true);
  });

  it("enforces real password authentication end-to-end", async () => {
    const jar = new CookieJar();
    const email = "auth-e2e@example.com";

    const signupRes = await jar.fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Auth Tester", email, password: "correcthorse1" }),
    });
    expect(signupRes.status).toBe(200);

    // A second signup with the same email is rejected.
    const dupeRes = await jar.fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Someone Else", email, password: "anotherpassword1" }),
    });
    expect(dupeRes.status).toBe(409);

    // Sign in with the wrong password is rejected.
    const wrongPasswordRes = await jar.fetch("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "not-the-password" }),
    });
    expect(wrongPasswordRes.status).toBe(401);

    // Sign in with the correct password succeeds and yields a session cookie
    // that unlocks an authenticated endpoint.
    const rightPasswordRes = await jar.fetch("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "correcthorse1" }),
    });
    expect(rightPasswordRes.status).toBe(200);
    expect((await jar.fetch("/api/notifications")).status).toBe(200);

    // Signing in to an email that was never signed up is rejected too.
    const unknownRes = await jar.fetch("/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "never-signed-up@example.com", password: "whatever123" }),
    });
    expect(unknownRes.status).toBe(401);
  });

  it("pushes a live unread-count update over the notifications SSE stream (6e)", async () => {
    const dmJar = new CookieJar();
    const playerJar = new CookieJar();

    await dmJar.signUp("SSE DM", "sse-dm@example.com");
    await playerJar.signUp("SSE Player", "sse-player@example.com");

    // Requires an auth cookie, same as the other /api/notifications routes.
    const signedOutRes = await fetch(`${BASE_URL}/api/notifications/stream`);
    expect(signedOutRes.status).toBe(401);

    const streamRes = await playerJar.fetch("/api/notifications/stream");
    expect(streamRes.status).toBe(200);
    expect(streamRes.headers.get("content-type")).toContain("text/event-stream");
    expect(streamRes.body).not.toBeNull();

    const reader = streamRes.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    async function readUntil(predicate: (buf: string) => boolean, timeoutMs = 10000) {
      const deadline = Date.now() + timeoutMs;
      while (!predicate(buffer)) {
        if (Date.now() > deadline) {
          throw new Error(`Timed out waiting for SSE data. Buffer so far: ${buffer}`);
        }
        const { value, done } = await reader.read();
        if (done) throw new Error("Stream closed before expected data arrived.");
        buffer += decoder.decode(value, { stream: true });
      }
    }

    // The route sends an immediate snapshot on connect: unreadCount 0 (no
    // notifications yet for this brand-new user).
    await readUntil((buf) => buf.includes('"unreadCount":0'));

    const { campaign } = await (
      await dmJar.fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "SSE Campaign",
          description: "",
          system: "SSE System",
          capacity: 3,
        }),
      })
    ).json();

    // Joining triggers a join_requested notification to the DM, not the
    // player, so drive the trigger the other direction: the player joins,
    // then the DM approves — approveRequest() notifies membership.user_id
    // (the player) with join_approved.
    const { membership } = await (
      await playerJar.fetch(`/api/campaigns/${campaign.id}/join`, { method: "POST" })
    ).json();
    await dmJar.fetch(`/api/campaigns/${campaign.id}/requests/${membership.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });

    await readUntil((buf) => {
      const matches = [...buf.matchAll(/"unreadCount":(\d+)/g)];
      return matches.some((m) => Number(m[1]) > 0);
    });

    await reader.cancel();
  });
});
