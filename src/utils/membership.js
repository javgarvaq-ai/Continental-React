/**
 * Membership discount utilities.
 * Pure functions — no side effects, no imports.
 */

/**
 * Computes the membership discount percentage and peso amount for a cart total.
 *
 * Looks for a benefit with benefit_type === 'discount' inside the membership's
 * plan benefits array. Returns zero for both values when no such benefit exists
 * or when the membership is null.
 *
 * @param {object|null} membership  - The active customer_memberships row
 *                                    (with membership_plans.membership_plan_benefits joined)
 * @param {number}      cartTotal   - The pre-discount cart total
 * @returns {{ pct: number, amount: number }}
 *   pct    — discount percentage (e.g. 15 for 15%)
 *   amount — rounded peso amount to deduct from cartTotal
 */
export function computeMembershipDiscount(membership, cartTotal) {
    const benefits = membership?.membership_plans?.membership_plan_benefits ?? []
    const discountBenefit = benefits.find(b => b.benefit_type === 'discount')
    const pct = Number(discountBenefit?.discount_percentage || 0)

    if (pct <= 0) return { pct: 0, amount: 0 }

    const amount = Math.round(Number(cartTotal || 0) * (pct / 100) * 100) / 100
    return { pct, amount }
}
