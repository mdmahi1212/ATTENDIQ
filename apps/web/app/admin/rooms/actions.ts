"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { check, formAction } from "@/lib/admin-action";
import { ringToEwkt } from "@/lib/geo";
import { roomSchema } from "@/lib/validation";

export const saveRoom = formAction({
  roles: ["admin"],
  schema: roomSchema.extend({ id: z.guid().optional() }),
  revalidate: "/admin/rooms",
  run: async ({ id, geofence, ...rest }, { supabase }) => {
    const row = {
      ...rest,
      name: rest.name ?? null,
      building: rest.building ?? null,
      floor: rest.floor ?? null,
      geofence: geofence ? ringToEwkt(geofence) : null,
    };
    if (id) {
      check(await supabase.from("rooms").update(row).eq("id", id));
      return `Room ${rest.code} saved.`;
    }
    const { data } = check(await supabase.from("rooms").insert(row).select("id").single());
    redirect(`/admin/rooms/${data!.id}`);
  },
});

export const deleteRoom = formAction({
  roles: ["admin"],
  schema: z.object({ id: z.guid() }),
  revalidate: "/admin/rooms",
  run: async ({ id }, { supabase }) => {
    check(await supabase.from("rooms").delete().eq("id", id));
    return "Room deleted.";
  },
});
