import { randomBytes, randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "../../lib/supabase-admin.js";
import type {
  AcceptPocketInput,
  AddTransactionInput,
  ArchivePocketInput,
  CreatePocketInput,
  DeleteTransactionInput,
  EditTransactionInput,
  GetPocketQuery,
  LeavePocketInput,
  SharePocketInput
} from "./schema.js";

type PocketRow = {
  id: string;
  owner_user_id: string;
  name: string;
  description: string | null;
  type: "personal" | "shared";
  currency: string;
  icon: string | null;
  color: string | null;
  is_archived: boolean;
  archived_at: string | null;
  share_mode: "invite_only" | "link" | null;
  created_at: string;
  updated_at: string;
};

type MemberRow = {
  id: string;
  pocket_id: string;
  user_id: string;
  role: "owner" | "member";
  status: "active" | "left" | "removed";
  joined_at: string;
  left_at: string | null;
  created_at: string;
  updated_at: string;
};

type TransactionRow = {
  id: string;
  created_by_user_id: string;
  merchant: string | null;
  title: string;
  amount: number;
  date_trx: string;
  category_id: string | null;
  category_label: string | null;
  note: string | null;
  attachment_uri: string | null;
  source: "manual" | "chat" | "photo" | "text";
  original_text: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by_user_id: string | null;
};

type PocketTransactionRow = {
  id: string;
  pocket_id: string;
  transaction_id: string;
  created_by_user_id: string;
  created_at: string;
};

type LinkRow = {
  id: string;
  pocket_id: string;
  code: string;
  created_by_user_id: string;
  status: "active" | "revoked" | "expired";
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  created_at: string;
  revoked_at: string | null;
};

const ERROR_STATUS: Record<string, number> = {
  POCKET_NOT_FOUND: 404,
  TRANSACTION_NOT_FOUND: 404,
  POCKET_FORBIDDEN: 403,
  POCKET_ARCHIVED: 409,
  OWNER_CANNOT_LEAVE: 409,
  INVALID_POCKET_TYPE: 400,
  LINK_INVALID: 404,
  LINK_EXPIRED: 409,
  LINK_USAGE_EXCEEDED: 409,
  TRANSACTION_EDIT_FORBIDDEN: 403,
  TRANSACTION_DELETE_FORBIDDEN: 403,
  BAD_REQUEST: 400,
  INTERNAL_ERROR: 500
};

export class PocketServiceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.status = ERROR_STATUS[code] ?? 500;
  }
}

function throwError(code: string, message?: string): never {
  throw new PocketServiceError(code, message);
}

function ensureWritablePocket(pocket: PocketRow) {
  if (pocket.is_archived) {
    throwError("POCKET_ARCHIVED", "Pocket is archived");
  }
}

async function getPocketById(pocketId: string) {
  const db = getSupabaseAdminClient();
  const { data, error } = await db.from("et_pockets").select("*").eq("id", pocketId).maybeSingle();

  if (error) {
    throwError("INTERNAL_ERROR", error.message);
  }

  if (!data) {
    throwError("POCKET_NOT_FOUND", "Pocket not found");
  }

  return data as PocketRow;
}

async function getMembership(pocketId: string, userId: string) {
  const db = getSupabaseAdminClient();
  const { data, error } = await db
    .from("et_pocket_members")
    .select("*")
    .eq("pocket_id", pocketId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throwError("INTERNAL_ERROR", error.message);
  }

  return (data as MemberRow | null) ?? null;
}

async function ensureActiveMember(pocketId: string, userId: string) {
  const membership = await getMembership(pocketId, userId);

  if (!membership || membership.status !== "active") {
    throwError("POCKET_FORBIDDEN", "Active membership is required");
  }

  return membership;
}

function makeShareCode() {
  return randomBytes(18).toString("base64url");
}

function normalizeLimit(limit?: number) {
  if (!limit) {
    return 20;
  }

  return Math.max(1, Math.min(limit, 100));
}

async function readTransactionsByIds(transactionIds: string[]) {
  if (transactionIds.length === 0) {
    return [] as TransactionRow[];
  }

  const db = getSupabaseAdminClient();
  const { data, error } = await db
    .from("et_transactions")
    .select("*")
    .in("id", transactionIds)
    .is("deleted_at", null);

  if (error) {
    throwError("INTERNAL_ERROR", error.message);
  }

  return (data as TransactionRow[]) ?? [];
}

function isAllowedEditor(actorUserId: string, pocket: PocketRow, transaction: TransactionRow) {
  return pocket.owner_user_id === actorUserId || transaction.created_by_user_id === actorUserId;
}

export async function createPocket(actorUserId: string, payload: CreatePocketInput) {
  const db = getSupabaseAdminClient();
  const pocketId = randomUUID();

  const { error: pocketError } = await db.from("et_pockets").insert({
    id: pocketId,
    owner_user_id: actorUserId,
    name: payload.name,
    description: payload.description ?? null,
    type: payload.type,
    currency: payload.currency,
    icon: payload.icon ?? null,
    color: payload.color ?? null,
    is_archived: false,
    archived_at: null,
    share_mode: payload.shareMode ?? (payload.type === "personal" ? "invite_only" : "invite_only")
  });

  if (pocketError) {
    throwError("INTERNAL_ERROR", pocketError.message);
  }

  const { error: memberError } = await db.from("et_pocket_members").insert({
    id: randomUUID(),
    pocket_id: pocketId,
    user_id: actorUserId,
    role: "owner",
    status: "active",
    joined_at: new Date().toISOString(),
    left_at: null
  });

  if (memberError) {
    await db.from("et_pockets").delete().eq("id", pocketId);
    throwError("INTERNAL_ERROR", memberError.message);
  }

  return { pocketId };
}

export async function getPocket(actorUserId: string, pocketId: string, query: GetPocketQuery) {
  await ensureActiveMember(pocketId, actorUserId);

  const pocket = await getPocketById(pocketId);
  const db = getSupabaseAdminClient();
  const limit = normalizeLimit(query.limit);

  const { data: relations, error: relationError } = await db
    .from("et_pocket_transactions")
    .select("transaction_id,created_at")
    .eq("pocket_id", pocketId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (relationError) {
    throwError("INTERNAL_ERROR", relationError.message);
  }

  const relationRows = (relations as Array<Pick<PocketTransactionRow, "transaction_id" | "created_at">>) ?? [];
  const pageRows = relationRows.slice(0, limit);
  const hasMore = relationRows.length > limit;
  const nextCursor = hasMore ? pageRows[pageRows.length - 1]?.created_at : undefined;

  const pageTransactionIds = pageRows.map((item) => item.transaction_id);
  const transactionRows = await readTransactionsByIds(pageTransactionIds);

  const transactionById = new Map(transactionRows.map((row) => [row.id, row]));

  const transactions = pageRows
    .map((row) => {
      const trx = transactionById.get(row.transaction_id);
      if (!trx) {
        return null;
      }

      return {
        ...trx,
        linked_at: row.created_at
      };
    })
    .filter((row): row is TransactionRow & { linked_at: string } => Boolean(row))
    .sort((a, b) => {
      if (a.date_trx !== b.date_trx) {
        return a.date_trx < b.date_trx ? 1 : -1;
      }

      return a.created_at < b.created_at ? 1 : -1;
    });

  const { data: allRelations, error: allRelationError } = await db
    .from("et_pocket_transactions")
    .select("transaction_id")
    .eq("pocket_id", pocketId);

  if (allRelationError) {
    throwError("INTERNAL_ERROR", allRelationError.message);
  }

  const allTransactionIds = ((allRelations as Array<{ transaction_id: string }>) ?? []).map((row) => row.transaction_id);
  const allTransactions = await readTransactionsByIds(allTransactionIds);
  const totalExpense = allTransactions.reduce((acc, item) => acc + Number(item.amount), 0);

  const { data: members, error: membersError } = await db
    .from("et_pocket_members")
    .select("*")
    .eq("pocket_id", pocketId)
    .eq("status", "active")
    .order("joined_at", { ascending: true });

  if (membersError) {
    throwError("INTERNAL_ERROR", membersError.message);
  }

  const membersRows = (members as MemberRow[]) ?? [];

  return {
    pocket,
    summary: {
      totalExpense,
      transactionCount: allTransactions.length,
      memberCount: membersRows.length
    },
    members: membersRows,
    transactions,
    nextCursor
  };
}

export async function sharePocket(actorUserId: string, payload: SharePocketInput) {
  const pocket = await getPocketById(payload.pocketId);
  ensureWritablePocket(pocket);

  if (pocket.owner_user_id !== actorUserId) {
    throwError("POCKET_FORBIDDEN", "Only owner can share pocket");
  }

  if (pocket.type !== "shared") {
    throwError("INVALID_POCKET_TYPE", "Only shared pocket can create share links");
  }

  const db = getSupabaseAdminClient();
  const linkId = randomUUID();
  const code = makeShareCode();

  const { error } = await db.from("et_pocket_links").insert({
    id: linkId,
    pocket_id: payload.pocketId,
    code,
    created_by_user_id: actorUserId,
    status: "active",
    expires_at: payload.expiresAt ?? null,
    max_uses: payload.maxUses ?? null,
    used_count: 0,
    revoked_at: null
  });

  if (error) {
    throwError("INTERNAL_ERROR", error.message);
  }

  return { linkId, code };
}

export async function acceptPocket(actorUserId: string, payload: AcceptPocketInput) {
  const db = getSupabaseAdminClient();

  const { data: link, error: linkError } = await db
    .from("et_pocket_links")
    .select("*")
    .eq("code", payload.code)
    .maybeSingle();

  if (linkError) {
    throwError("INTERNAL_ERROR", linkError.message);
  }

  if (!link) {
    throwError("LINK_INVALID", "Share link not found");
  }

  const linkRow = link as LinkRow;

  if (linkRow.status !== "active") {
    throwError("LINK_INVALID", "Share link is not active");
  }

  if (linkRow.expires_at && new Date().getTime() > new Date(linkRow.expires_at).getTime()) {
    await db.from("et_pocket_links").update({ status: "expired" }).eq("id", linkRow.id);
    throwError("LINK_EXPIRED", "Share link has expired");
  }

  if (linkRow.max_uses !== null && linkRow.used_count >= linkRow.max_uses) {
    throwError("LINK_USAGE_EXCEEDED", "Share link usage limit reached");
  }

  const pocket = await getPocketById(linkRow.pocket_id);
  ensureWritablePocket(pocket);

  if (pocket.owner_user_id === actorUserId) {
    return { pocketId: pocket.id };
  }

  const existingMember = await getMembership(pocket.id, actorUserId);

  if (existingMember && existingMember.status === "active") {
    return { pocketId: pocket.id };
  }

  if (existingMember) {
    const { error: updateMemberError } = await db
      .from("et_pocket_members")
      .update({
        status: "active",
        role: existingMember.role === "owner" ? "owner" : "member",
        joined_at: new Date().toISOString(),
        left_at: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", existingMember.id);

    if (updateMemberError) {
      throwError("INTERNAL_ERROR", updateMemberError.message);
    }
  } else {
    const { error: insertMemberError } = await db.from("et_pocket_members").insert({
      id: randomUUID(),
      pocket_id: pocket.id,
      user_id: actorUserId,
      role: "member",
      status: "active",
      joined_at: new Date().toISOString(),
      left_at: null
    });

    if (insertMemberError) {
      throwError("INTERNAL_ERROR", insertMemberError.message);
    }
  }

  const { error: linkUpdateError } = await db
    .from("et_pocket_links")
    .update({ used_count: linkRow.used_count + 1 })
    .eq("id", linkRow.id);

  if (linkUpdateError) {
    throwError("INTERNAL_ERROR", linkUpdateError.message);
  }

  return { pocketId: pocket.id };
}

export async function leavePocket(actorUserId: string, payload: LeavePocketInput) {
  const pocket = await getPocketById(payload.pocketId);

  if (pocket.owner_user_id === actorUserId) {
    throwError("OWNER_CANNOT_LEAVE", "Owner cannot leave pocket");
  }

  const member = await ensureActiveMember(payload.pocketId, actorUserId);

  const db = getSupabaseAdminClient();
  const { error } = await db
    .from("et_pocket_members")
    .update({
      status: "left",
      left_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", member.id);

  if (error) {
    throwError("INTERNAL_ERROR", error.message);
  }

  return { success: true };
}

export async function archivePocket(actorUserId: string, payload: ArchivePocketInput) {
  const pocket = await getPocketById(payload.pocketId);

  if (pocket.owner_user_id !== actorUserId) {
    throwError("POCKET_FORBIDDEN", "Only owner can archive pocket");
  }

  if (pocket.is_archived) {
    return { success: true };
  }

  const db = getSupabaseAdminClient();
  const { error } = await db
    .from("et_pockets")
    .update({
      is_archived: true,
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", payload.pocketId);

  if (error) {
    throwError("INTERNAL_ERROR", error.message);
  }

  return { success: true };
}

export async function addTransaction(actorUserId: string, payload: AddTransactionInput) {
  const pocket = await getPocketById(payload.pocketId);
  ensureWritablePocket(pocket);
  await ensureActiveMember(payload.pocketId, actorUserId);

  const db = getSupabaseAdminClient();
  const transactionId = randomUUID();

  const { error: transactionError } = await db.from("et_transactions").insert({
    id: transactionId,
    created_by_user_id: actorUserId,
    merchant: payload.merchant ?? null,
    title: payload.title,
    amount: payload.amount,
    date_trx: payload.dateTrx,
    category_id: payload.categoryId ?? null,
    category_label: payload.categoryLabel ?? null,
    note: payload.note ?? null,
    attachment_uri: payload.attachmentUri ?? null,
    source: payload.source,
    original_text: payload.originalText ?? null,
    deleted_at: null,
    deleted_by_user_id: null
  });

  if (transactionError) {
    throwError("INTERNAL_ERROR", transactionError.message);
  }

  const { error: relationError } = await db.from("et_pocket_transactions").insert({
    id: randomUUID(),
    pocket_id: payload.pocketId,
    transaction_id: transactionId,
    created_by_user_id: actorUserId
  });

  if (relationError) {
    await db.from("et_transactions").delete().eq("id", transactionId);
    throwError("INTERNAL_ERROR", relationError.message);
  }

  return { transactionId };
}

export async function editTransaction(actorUserId: string, payload: EditTransactionInput) {
  const pocket = await getPocketById(payload.pocketId);
  ensureWritablePocket(pocket);

  const db = getSupabaseAdminClient();

  const { data: relation, error: relationError } = await db
    .from("et_pocket_transactions")
    .select("id")
    .eq("pocket_id", payload.pocketId)
    .eq("transaction_id", payload.transactionId)
    .maybeSingle();

  if (relationError) {
    throwError("INTERNAL_ERROR", relationError.message);
  }

  if (!relation) {
    throwError("TRANSACTION_NOT_FOUND", "Transaction relation not found");
  }

  const { data: transaction, error: transactionError } = await db
    .from("et_transactions")
    .select("*")
    .eq("id", payload.transactionId)
    .is("deleted_at", null)
    .maybeSingle();

  if (transactionError) {
    throwError("INTERNAL_ERROR", transactionError.message);
  }

  if (!transaction) {
    throwError("TRANSACTION_NOT_FOUND", "Transaction not found");
  }

  const trx = transaction as TransactionRow;

  if (!isAllowedEditor(actorUserId, pocket, trx)) {
    throwError("TRANSACTION_EDIT_FORBIDDEN", "Not allowed to edit transaction");
  }

  const { error: updateError } = await db
    .from("et_transactions")
    .update({
      merchant: payload.merchant ?? null,
      title: payload.title,
      amount: payload.amount,
      date_trx: payload.dateTrx,
      category_id: payload.categoryId ?? null,
      category_label: payload.categoryLabel ?? null,
      note: payload.note ?? null,
      attachment_uri: payload.attachmentUri ?? null,
      updated_at: new Date().toISOString()
    })
    .eq("id", payload.transactionId);

  if (updateError) {
    throwError("INTERNAL_ERROR", updateError.message);
  }

  return { success: true };
}

export async function deleteTransaction(actorUserId: string, payload: DeleteTransactionInput) {
  const pocket = await getPocketById(payload.pocketId);
  ensureWritablePocket(pocket);

  const db = getSupabaseAdminClient();

  const { data: relation, error: relationError } = await db
    .from("et_pocket_transactions")
    .select("id")
    .eq("pocket_id", payload.pocketId)
    .eq("transaction_id", payload.transactionId)
    .maybeSingle();

  if (relationError) {
    throwError("INTERNAL_ERROR", relationError.message);
  }

  if (!relation) {
    throwError("TRANSACTION_NOT_FOUND", "Transaction relation not found");
  }

  const { data: transaction, error: transactionError } = await db
    .from("et_transactions")
    .select("*")
    .eq("id", payload.transactionId)
    .is("deleted_at", null)
    .maybeSingle();

  if (transactionError) {
    throwError("INTERNAL_ERROR", transactionError.message);
  }

  if (!transaction) {
    throwError("TRANSACTION_NOT_FOUND", "Transaction not found");
  }

  const trx = transaction as TransactionRow;

  if (!isAllowedEditor(actorUserId, pocket, trx)) {
    throwError("TRANSACTION_DELETE_FORBIDDEN", "Not allowed to delete transaction");
  }

  const { error: deleteError } = await db
    .from("et_transactions")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by_user_id: actorUserId,
      updated_at: new Date().toISOString()
    })
    .eq("id", payload.transactionId);

  if (deleteError) {
    throwError("INTERNAL_ERROR", deleteError.message);
  }

  return { success: true };
}
