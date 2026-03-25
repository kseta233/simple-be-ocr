import { beforeEach, describe, expect, it, vi } from "vitest";

type ScriptStep = {
  expect: {
    table: string;
    op: string;
    filters?: Array<{ type: string; field: string; value: unknown }>;
    payload?: unknown;
  };
  result: { data?: unknown; error?: { message: string } | null };
};

type ExecutedQuery = {
  table: string;
  op: string;
  payload: unknown;
  filters: Array<{ type: string; field: string; value: unknown }>;
};

class QueryMock {
  private op = "select";
  private payload: unknown;
  private filters: Array<{ type: string; field: string; value: unknown }> = [];
  private executed: Promise<{ data?: unknown; error?: { message: string } | null }> | null = null;

  constructor(
    private readonly table: string,
    private readonly script: ScriptStep[],
    private readonly calls: ExecutedQuery[]
  ) {}

  select() {
    this.op = "select";
    return this;
  }

  insert(payload: unknown) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.op = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ type: "eq", field, value });
    return this;
  }

  in(field: string, value: unknown) {
    this.filters.push({ type: "in", field, value });
    return this;
  }

  is(field: string, value: unknown) {
    this.filters.push({ type: "is", field, value });
    return this;
  }

  order(field: string, value: unknown) {
    this.filters.push({ type: "order", field, value });
    return this;
  }

  limit(value: number) {
    this.filters.push({ type: "limit", field: "_", value });
    return this;
  }

  maybeSingle() {
    this.filters.push({ type: "mode", field: "maybeSingle", value: true });
    return this;
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data?: unknown; error?: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    if (!this.executed) {
      this.executed = Promise.resolve().then(() => {
        const step = this.script.shift();
        if (!step) {
          throw new Error(`No script step left for ${this.table}.${this.op}`);
        }

        expect(step.expect.table).toBe(this.table);
        expect(step.expect.op).toBe(this.op);

        if (step.expect.filters) {
          expect(this.filters).toEqual(step.expect.filters);
        }

        if (Object.prototype.hasOwnProperty.call(step.expect, "payload")) {
          expect(this.payload).toEqual(step.expect.payload);
        }

        this.calls.push({
          table: this.table,
          op: this.op,
          payload: this.payload,
          filters: this.filters
        });

        return {
          data: step.result.data,
          error: step.result.error ?? null
        };
      });
    }

    return this.executed.then(onfulfilled, onrejected);
  }
}

class DbMock {
  readonly calls: ExecutedQuery[] = [];

  constructor(private readonly script: ScriptStep[]) {}

  from(table: string) {
    return new QueryMock(table, this.script, this.calls);
  }
}

const hoisted = vi.hoisted(() => ({
  getSupabaseAdminClientMock: vi.fn(),
  randomUUIDMock: vi.fn(),
  randomBytesMock: vi.fn()
}));

let uuidCounter = 0;

vi.mock("../lib/supabase-admin.js", () => ({
  getSupabaseAdminClient: hoisted.getSupabaseAdminClientMock
}));

vi.mock("node:crypto", () => ({
  randomUUID: hoisted.randomUUIDMock,
  randomBytes: hoisted.randomBytesMock
}));

import {
  acceptPocket,
  addTransaction,
  archivePocket,
  createPocket,
  deleteTransaction,
  editTransaction,
  getPocket,
  leavePocket,
  PocketServiceError,
  sharePocket
} from "../modules/pockets/service.js";

const actorUserId = "00000000-0000-0000-0000-000000000111";
const ownerUserId = "00000000-0000-0000-0000-000000000999";

function pocketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pocket-1",
    owner_user_id: ownerUserId,
    name: "Pocket",
    description: null,
    type: "shared",
    currency: "IDR",
    icon: null,
    color: null,
    is_archived: false,
    archived_at: null,
    share_mode: "link",
    created_at: "2026-03-25T00:00:00.000Z",
    updated_at: "2026-03-25T00:00:00.000Z",
    ...overrides
  };
}

function activeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: "member-1",
    pocket_id: "pocket-1",
    user_id: actorUserId,
    role: "member",
    status: "active",
    joined_at: "2026-03-25T00:00:00.000Z",
    left_at: null,
    created_at: "2026-03-25T00:00:00.000Z",
    updated_at: "2026-03-25T00:00:00.000Z",
    ...overrides
  };
}

function transactionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "trx-1",
    created_by_user_id: actorUserId,
    merchant: "Store",
    title: "Coffee",
    amount: 10000,
    date_trx: "2026-03-25",
    category_id: null,
    category_label: null,
    note: null,
    attachment_uri: null,
    source: "manual",
    original_text: null,
    created_at: "2026-03-25T00:00:00.000Z",
    updated_at: "2026-03-25T00:00:00.000Z",
    deleted_at: null,
    deleted_by_user_id: null,
    ...overrides
  };
}

function expectPocketError(error: unknown, code: string) {
  expect(error).toBeInstanceOf(PocketServiceError);
  expect((error as PocketServiceError).code).toBe(code);
}

describe("pockets service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;
    hoisted.randomUUIDMock.mockImplementation(() => {
      uuidCounter += 1;
      if (uuidCounter === 1) return "uuid-pocket";
      if (uuidCounter === 2) return "uuid-member";
      if (uuidCounter === 3) return "uuid-link";
      if (uuidCounter === 4) return "uuid-accept-member";
      if (uuidCounter === 5) return "uuid-transaction";
      if (uuidCounter === 6) return "uuid-pocket-transaction";
      return `uuid-${uuidCounter}`;
    });
    hoisted.randomBytesMock.mockImplementation(() => ({ toString: () => "share-code" }));
  });

  it("createPocket success inserts pocket and owner membership", async () => {
    const db = new DbMock([
      {
        expect: {
          table: "et_pockets",
          op: "insert"
        },
        result: {}
      },
      {
        expect: {
          table: "et_pocket_members",
          op: "insert"
        },
        result: {}
      }
    ]);
    hoisted.getSupabaseAdminClientMock.mockReturnValue(db);

    const result = await createPocket(actorUserId, {
      name: "Trip",
      type: "personal",
      currency: "IDR"
    });

    expect(result).toEqual({ pocketId: "uuid-pocket" });
    expect(db.calls).toHaveLength(2);
  });

  it("createPocket rolls back pocket when owner member insert fails", async () => {
    const db = new DbMock([
      { expect: { table: "et_pockets", op: "insert" }, result: {} },
      {
        expect: { table: "et_pocket_members", op: "insert" },
        result: { error: { message: "member failed" } }
      },
      {
        expect: {
          table: "et_pockets",
          op: "delete",
          filters: [{ type: "eq", field: "id", value: "uuid-pocket" }]
        },
        result: {}
      }
    ]);
    hoisted.getSupabaseAdminClientMock.mockReturnValue(db);

    await expect(
      createPocket(actorUserId, {
        name: "Trip",
        type: "personal",
        currency: "IDR"
      })
    ).rejects.toSatisfy((err: unknown) => {
      expectPocketError(err, "INTERNAL_ERROR");
      return true;
    });
  });

  it("getPocket blocks non active member", async () => {
    const db = new DbMock([
      {
        expect: {
          table: "et_pocket_members",
          op: "select",
          filters: [
            { type: "eq", field: "pocket_id", value: "pocket-1" },
            { type: "eq", field: "user_id", value: actorUserId },
            { type: "mode", field: "maybeSingle", value: true }
          ]
        },
        result: { data: { ...activeMember(), status: "left" } }
      }
    ]);
    hoisted.getSupabaseAdminClientMock.mockReturnValue(db);

    await expect(getPocket(actorUserId, "pocket-1", {})).rejects.toSatisfy((err: unknown) => {
      expectPocketError(err, "POCKET_FORBIDDEN");
      return true;
    });
  });

  it("getPocket returns pocket detail with summary and pagination cursor", async () => {
    const db = new DbMock([
      {
        expect: {
          table: "et_pocket_members",
          op: "select",
          filters: [
            { type: "eq", field: "pocket_id", value: "pocket-1" },
            { type: "eq", field: "user_id", value: actorUserId },
            { type: "mode", field: "maybeSingle", value: true }
          ]
        },
        result: { data: activeMember() }
      },
      {
        expect: {
          table: "et_pockets",
          op: "select",
          filters: [
            { type: "eq", field: "id", value: "pocket-1" },
            { type: "mode", field: "maybeSingle", value: true }
          ]
        },
        result: { data: pocketRow({ id: "pocket-1" }) }
      },
      {
        expect: {
          table: "et_pocket_transactions",
          op: "select",
          filters: [
            { type: "eq", field: "pocket_id", value: "pocket-1" },
            { type: "order", field: "created_at", value: { ascending: false } },
            { type: "limit", field: "_", value: 2 }
          ]
        },
        result: {
          data: [
            { transaction_id: "trx-1", created_at: "2026-03-25T10:00:00.000Z" },
            { transaction_id: "trx-2", created_at: "2026-03-24T10:00:00.000Z" }
          ]
        }
      },
      {
        expect: {
          table: "et_transactions",
          op: "select",
          filters: [
            { type: "in", field: "id", value: ["trx-1"] },
            { type: "is", field: "deleted_at", value: null }
          ]
        },
        result: { data: [transactionRow({ id: "trx-1" })] }
      },
      {
        expect: {
          table: "et_pocket_transactions",
          op: "select",
          filters: [{ type: "eq", field: "pocket_id", value: "pocket-1" }]
        },
        result: { data: [{ transaction_id: "trx-1" }, { transaction_id: "trx-2" }] }
      },
      {
        expect: {
          table: "et_transactions",
          op: "select",
          filters: [
            { type: "in", field: "id", value: ["trx-1", "trx-2"] },
            { type: "is", field: "deleted_at", value: null }
          ]
        },
        result: { data: [transactionRow({ id: "trx-1", amount: 10000 }), transactionRow({ id: "trx-2", amount: 25000 })] }
      },
      {
        expect: {
          table: "et_pocket_members",
          op: "select",
          filters: [
            { type: "eq", field: "pocket_id", value: "pocket-1" },
            { type: "eq", field: "status", value: "active" },
            { type: "order", field: "joined_at", value: { ascending: true } }
          ]
        },
        result: { data: [activeMember(), activeMember({ id: "member-2", user_id: ownerUserId })] }
      }
    ]);
    hoisted.getSupabaseAdminClientMock.mockReturnValue(db);

    const result = await getPocket(actorUserId, "pocket-1", { limit: 1 });

    expect(result.summary.totalExpense).toBe(35000);
    expect(result.summary.transactionCount).toBe(2);
    expect(result.summary.memberCount).toBe(2);
    expect(result.transactions).toHaveLength(1);
    expect(result.nextCursor).toBe("2026-03-25T10:00:00.000Z");
  });

  it("sharePocket requires owner and shared pocket", async () => {
    const db = new DbMock([
      {
        expect: {
          table: "et_pockets",
          op: "select",
          filters: [
            { type: "eq", field: "id", value: "pocket-1" },
            { type: "mode", field: "maybeSingle", value: true }
          ]
        },
        result: { data: pocketRow({ owner_user_id: actorUserId, type: "personal" }) }
      }
    ]);
    hoisted.getSupabaseAdminClientMock.mockReturnValue(db);

    await expect(sharePocket(actorUserId, { pocketId: "pocket-1" })).rejects.toSatisfy((err: unknown) => {
      expectPocketError(err, "INVALID_POCKET_TYPE");
      return true;
    });
  });

  it("sharePocket inserts active link", async () => {
    const db = new DbMock([
      {
        expect: {
          table: "et_pockets",
          op: "select",
          filters: [
            { type: "eq", field: "id", value: "pocket-1" },
            { type: "mode", field: "maybeSingle", value: true }
          ]
        },
        result: { data: pocketRow({ owner_user_id: actorUserId, type: "shared" }) }
      },
      { expect: { table: "et_pocket_links", op: "insert" }, result: {} }
    ]);
    hoisted.getSupabaseAdminClientMock.mockReturnValue(db);

    const result = await sharePocket(actorUserId, { pocketId: "pocket-1" });
    expect(result.code).toBe("share-code");
  });

  it("acceptPocket expires outdated link", async () => {
    const db = new DbMock([
      {
        expect: {
          table: "et_pocket_links",
          op: "select",
          filters: [
            { type: "eq", field: "code", value: "abc" },
            { type: "mode", field: "maybeSingle", value: true }
          ]
        },
        result: {
          data: {
            id: "link-1",
            pocket_id: "pocket-1",
            code: "abc",
            created_by_user_id: ownerUserId,
            status: "active",
            expires_at: "2000-01-01T00:00:00.000Z",
            max_uses: null,
            used_count: 0,
            created_at: "2026-03-25T00:00:00.000Z",
            revoked_at: null
          }
        }
      },
      {
        expect: {
          table: "et_pocket_links",
          op: "update",
          filters: [{ type: "eq", field: "id", value: "link-1" }],
          payload: { status: "expired" }
        },
        result: {}
      }
    ]);
    hoisted.getSupabaseAdminClientMock.mockReturnValue(db);

    await expect(acceptPocket(actorUserId, { code: "abc" })).rejects.toSatisfy((err: unknown) => {
      expectPocketError(err, "LINK_EXPIRED");
      return true;
    });
  });

  it("acceptPocket returns early for owner", async () => {
    const db = new DbMock([
      {
        expect: {
          table: "et_pocket_links",
          op: "select",
          filters: [
            { type: "eq", field: "code", value: "abc" },
            { type: "mode", field: "maybeSingle", value: true }
          ]
        },
        result: {
          data: {
            id: "link-1",
            pocket_id: "pocket-1",
            code: "abc",
            created_by_user_id: ownerUserId,
            status: "active",
            expires_at: null,
            max_uses: null,
            used_count: 0,
            created_at: "2026-03-25T00:00:00.000Z",
            revoked_at: null
          }
        }
      },
      {
        expect: {
          table: "et_pockets",
          op: "select",
          filters: [
            { type: "eq", field: "id", value: "pocket-1" },
            { type: "mode", field: "maybeSingle", value: true }
          ]
        },
        result: { data: pocketRow({ id: "pocket-1", owner_user_id: actorUserId }) }
      }
    ]);
    hoisted.getSupabaseAdminClientMock.mockReturnValue(db);

    const result = await acceptPocket(actorUserId, { code: "abc" });
    expect(result).toEqual({ pocketId: "pocket-1" });
  });

  it("leavePocket blocks owner", async () => {
    const db = new DbMock([
      {
        expect: {
          table: "et_pockets",
          op: "select",
          filters: [
            { type: "eq", field: "id", value: "pocket-1" },
            { type: "mode", field: "maybeSingle", value: true }
          ]
        },
        result: { data: pocketRow({ owner_user_id: actorUserId }) }
      }
    ]);
    hoisted.getSupabaseAdminClientMock.mockReturnValue(db);

    await expect(leavePocket(actorUserId, { pocketId: "pocket-1" })).rejects.toSatisfy((err: unknown) => {
      expectPocketError(err, "OWNER_CANNOT_LEAVE");
      return true;
    });
  });

  it("archivePocket idempotent when already archived", async () => {
    const db = new DbMock([
      {
        expect: {
          table: "et_pockets",
          op: "select",
          filters: [
            { type: "eq", field: "id", value: "pocket-1" },
            { type: "mode", field: "maybeSingle", value: true }
          ]
        },
        result: { data: pocketRow({ owner_user_id: actorUserId, is_archived: true }) }
      }
    ]);
    hoisted.getSupabaseAdminClientMock.mockReturnValue(db);

    const result = await archivePocket(actorUserId, { pocketId: "pocket-1" });
    expect(result).toEqual({ success: true });
  });

  it("addTransaction rolls back transaction insert when relation fails", async () => {
    const db = new DbMock([
      {
        expect: {
          table: "et_pockets",
          op: "select",
          filters: [
            { type: "eq", field: "id", value: "pocket-1" },
            { type: "mode", field: "maybeSingle", value: true }
          ]
        },
        result: { data: pocketRow({ id: "pocket-1", is_archived: false }) }
      },
      {
        expect: {
          table: "et_pocket_members",
          op: "select",
          filters: [
            { type: "eq", field: "pocket_id", value: "pocket-1" },
            { type: "eq", field: "user_id", value: actorUserId },
            { type: "mode", field: "maybeSingle", value: true }
          ]
        },
        result: { data: activeMember() }
      },
      { expect: { table: "et_transactions", op: "insert" }, result: {} },
      {
        expect: { table: "et_pocket_transactions", op: "insert" },
        result: { error: { message: "relation failed" } }
      },
      {
        expect: {
          table: "et_transactions",
          op: "delete"
        },
        result: {}
      }
    ]);
    hoisted.getSupabaseAdminClientMock.mockReturnValue(db);

    await expect(
      addTransaction(actorUserId, {
        pocketId: "pocket-1",
        title: "Lunch",
        amount: 50000,
        dateTrx: "2026-03-25",
        source: "manual"
      })
    ).rejects.toSatisfy((err: unknown) => {
      expectPocketError(err, "INTERNAL_ERROR");
      return true;
    });
  });

  it("editTransaction rejects non owner and non creator", async () => {
    const db = new DbMock([
      {
        expect: {
          table: "et_pockets",
          op: "select",
          filters: [
            { type: "eq", field: "id", value: "pocket-1" },
            { type: "mode", field: "maybeSingle", value: true }
          ]
        },
        result: { data: pocketRow({ owner_user_id: ownerUserId }) }
      },
      {
        expect: {
          table: "et_pocket_transactions",
          op: "select",
          filters: [
            { type: "eq", field: "pocket_id", value: "pocket-1" },
            { type: "eq", field: "transaction_id", value: "trx-1" },
            { type: "mode", field: "maybeSingle", value: true }
          ]
        },
        result: { data: { id: "rel-1" } }
      },
      {
        expect: {
          table: "et_transactions",
          op: "select",
          filters: [
            { type: "eq", field: "id", value: "trx-1" },
            { type: "is", field: "deleted_at", value: null },
            { type: "mode", field: "maybeSingle", value: true }
          ]
        },
        result: { data: transactionRow({ created_by_user_id: "00000000-0000-0000-0000-000000000777" }) }
      }
    ]);
    hoisted.getSupabaseAdminClientMock.mockReturnValue(db);

    await expect(
      editTransaction(actorUserId, {
        pocketId: "pocket-1",
        transactionId: "trx-1",
        title: "Edit",
        amount: 1,
        dateTrx: "2026-03-25"
      })
    ).rejects.toSatisfy((err: unknown) => {
      expectPocketError(err, "TRANSACTION_EDIT_FORBIDDEN");
      return true;
    });
  });

  it("deleteTransaction success for pocket owner", async () => {
    const db = new DbMock([
      {
        expect: {
          table: "et_pockets",
          op: "select",
          filters: [
            { type: "eq", field: "id", value: "pocket-1" },
            { type: "mode", field: "maybeSingle", value: true }
          ]
        },
        result: { data: pocketRow({ owner_user_id: actorUserId }) }
      },
      {
        expect: {
          table: "et_pocket_transactions",
          op: "select",
          filters: [
            { type: "eq", field: "pocket_id", value: "pocket-1" },
            { type: "eq", field: "transaction_id", value: "trx-1" },
            { type: "mode", field: "maybeSingle", value: true }
          ]
        },
        result: { data: { id: "rel-1" } }
      },
      {
        expect: {
          table: "et_transactions",
          op: "select",
          filters: [
            { type: "eq", field: "id", value: "trx-1" },
            { type: "is", field: "deleted_at", value: null },
            { type: "mode", field: "maybeSingle", value: true }
          ]
        },
        result: { data: transactionRow({ id: "trx-1", created_by_user_id: ownerUserId }) }
      },
      {
        expect: {
          table: "et_transactions",
          op: "update",
          filters: [{ type: "eq", field: "id", value: "trx-1" }]
        },
        result: {}
      }
    ]);
    hoisted.getSupabaseAdminClientMock.mockReturnValue(db);

    const result = await deleteTransaction(actorUserId, {
      pocketId: "pocket-1",
      transactionId: "trx-1"
    });

    expect(result).toEqual({ success: true });
  });
});
