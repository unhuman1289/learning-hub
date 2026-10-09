export type AccountRole = "admin" | "learner";
export type AccountStatus = "pending" | "active" | "disabled";

export function initialAccountStatus(isLocal: boolean): AccountStatus {
  return isLocal ? "active" : "pending";
}

export function statusAfterEmailVerification(role: string, isLocal: boolean): AccountStatus {
  return isLocal || role === "admin" ? "active" : "pending";
}

export function mayCreateSession(status: string | null | undefined): boolean {
  return status === "active";
}

export function mayApproveAccount(account: {
  role: string;
  status: string;
  emailVerified: boolean;
}): boolean {
  return account.role === "learner" && account.status === "pending" && account.emailVerified;
}
