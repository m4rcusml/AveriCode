import { afterEach, describe, expect, test } from "vitest";
import { createGitHubSetupState, verifyGitHubSetupState } from "@/lib/github/setup-state";

describe("GitHub setup state", () => {
  const priorSecret = process.env.NEXTAUTH_SECRET;

  afterEach(() => {
    if (priorSecret === undefined) {
      delete process.env.NEXTAUTH_SECRET;
    } else {
      process.env.NEXTAUTH_SECRET = priorSecret;
    }
  });

  test("binds a signed state to the user and workspace", () => {
    process.env.NEXTAUTH_SECRET = "test-secret";
    const token = createGitHubSetupState("user-1", "workspace-2", 1_000_000);

    expect(verifyGitHubSetupState(token, "user-1", 1_000_500)).toMatchObject({
      userId: "user-1",
      workspaceId: "workspace-2"
    });
    expect(() => verifyGitHubSetupState(token, "user-2", 1_000_500)).toThrow(
      "Invalid GitHub setup state"
    );
  });

  test("rejects tampered and expired states", () => {
    process.env.NEXTAUTH_SECRET = "test-secret";
    const token = createGitHubSetupState("user-1", "workspace-1", 1_000_000);

    expect(() => verifyGitHubSetupState(`${token}tampered`, "user-1", 1_000_500)).toThrow();
    expect(() => verifyGitHubSetupState(token, "user-1", 2_000_000)).toThrow("expired");
    expect(() => verifyGitHubSetupState(token, "user-1", 1_900_000)).toThrow("expired");
  });
});
