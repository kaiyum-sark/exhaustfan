export type AdminStatus = "ACTIVE" | "SUSPENDED";

/** The authenticated admin's identity + resolved permission set for this request. */
export interface CurrentAdmin {
  id: string;
  email: string;
  roleName: string;
  permissions: Set<string>;
}
