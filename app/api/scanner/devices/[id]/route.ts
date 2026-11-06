import type { NextRequest } from "next/server"
import { revokeDevice } from "@/lib/scanner"
import { scannerJson, withDevice } from "@/lib/scanner-api"

/** DELETE /api/scanner/devices/:id (admin phones only): signs a staff phone out at once. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withDevice(
    req,
    async (ctx) => {
      const result = await revokeDevice(ctx.actor, (await params).id)
      return result.ok ? scannerJson({ message: "Signed out." }) : scannerJson({ message: result.message }, 400)
    },
    { adminOnly: true },
  )
}
