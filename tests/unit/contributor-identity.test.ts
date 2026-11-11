import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { contributor: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn() } }
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
import { findOrCreateContributor } from "@/lib/contributors";

describe("stable contributor identity", () => {
  beforeEach(() => {
    mocks.prisma.contributor.findMany.mockResolvedValue([]);
    mocks.prisma.contributor.create.mockImplementation(async ({ data }) => ({ id: "new", ...data }));
    mocks.prisma.contributor.update.mockImplementation(async ({ where, data }) => ({ ...where, ...data }));
    mocks.prisma.contributor.upsert.mockImplementation(async ({ create }) => create);
  });

  test("does not merge different GitHub accounts that share an email or a recycled login", async () => {
    mocks.prisma.contributor.findMany.mockResolvedValue([
      { id: "old", githubUserId: "10", username: "recycled", email: "same@example.test" }
    ]);
    const contributor = await findOrCreateContributor({
      githubUserId: "20", username: "recycled", email: "same@example.test", name: "New owner"
    });

    expect(contributor.githubUserId).toBe("20");
    expect(mocks.prisma.contributor.update).not.toHaveBeenCalled();
    expect(mocks.prisma.contributor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ githubUserId: "20", username: undefined, email: undefined, name: "New owner" })
    });
  });

  test("still resolves a renamed GitHub account by its stable id", async () => {
    mocks.prisma.contributor.findMany.mockResolvedValue([
      { id: "stable", githubUserId: "10", username: "old-login", email: null }
    ]);
    await findOrCreateContributor({ githubUserId: "10", username: "new-login" });

    expect(mocks.prisma.contributor.update).toHaveBeenCalledWith({
      where: { id: "stable" }, data: expect.objectContaining({ githubUserId: "10", username: "new-login" })
    });
    expect(mocks.prisma.contributor.create).not.toHaveBeenCalled();
  });

  test("handles a concurrent email collision without merging different GitHub ids", async () => {
    mocks.prisma.contributor.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: "other", githubUserId: "10", username: "other", email: "shared@example.test" }
    ]);
    mocks.prisma.contributor.create.mockRejectedValueOnce({ code: "P2002" });

    await findOrCreateContributor({ githubUserId: "20", username: "new", email: "shared@example.test" });

    expect(mocks.prisma.contributor.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ githubUserId: "20", username: "new", email: undefined })
    });
    expect(mocks.prisma.contributor.update).not.toHaveBeenCalled();
  });

  test("a forged unverified email never resolves to the named GitHub identity that owns it", async () => {
    mocks.prisma.contributor.findMany.mockResolvedValue([
      { id: "alice", githubUserId: "42", username: "alice", email: "alice-private@example.test" }
    ]);
    const anonymous = await findOrCreateContributor({ email: "alice-private@example.test", name: "Forged Alice", username: "alice" });
    const repeated = await findOrCreateContributor({ email: "ALICE-PRIVATE@example.test" });

    expect(anonymous.id).toMatch(/^unverified-[a-f0-9]{64}$/);
    expect(repeated.id).toBe(anonymous.id);
    expect(mocks.prisma.contributor.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.contributor.update).not.toHaveBeenCalled();
    expect(mocks.prisma.contributor.upsert).toHaveBeenCalledWith({
      where: { id: anonymous.id }, update: {}, create: { id: anonymous.id }
    });
  });

  test("a verified id cannot claim a different configured login solely by its commit email", async () => {
    mocks.prisma.contributor.findMany.mockResolvedValue([
      { id: "expected-alice", githubUserId: null, username: "alice", email: "alice-private@example.test" }
    ]);
    await findOrCreateContributor({ githubUserId: "99", username: "bob", email: "alice-private@example.test" });

    expect(mocks.prisma.contributor.update).not.toHaveBeenCalled();
    expect(mocks.prisma.contributor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ githubUserId: "99", username: "bob", email: undefined })
    });
  });

  test("a verified GitHub author can resolve the matching configured login", async () => {
    mocks.prisma.contributor.findMany.mockResolvedValue([
      { id: "configured-alice", githubUserId: null, username: "alice", email: null }
    ]);
    await findOrCreateContributor({ githubUserId: "42", username: "alice" });

    expect(mocks.prisma.contributor.update).toHaveBeenCalledWith({
      where: { id: "configured-alice" }, data: expect.objectContaining({ githubUserId: "42", username: "alice" })
    });
    expect(mocks.prisma.contributor.create).not.toHaveBeenCalled();
  });

  test("rejects empty or malformed identities before writing", async () => {
    await expect(findOrCreateContributor({ username: "   " })).rejects.toThrow("Contributor requires");
    expect(mocks.prisma.contributor.create).not.toHaveBeenCalled();
  });
});
