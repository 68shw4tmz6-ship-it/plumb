import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireBoss } from "@/lib/auth";
import { Card, EmptyState, PageHead } from "@/components/ui";
import { QuoteBuilder } from "../quote-builder";
import { UploadQuoteForm } from "../upload-form";
import type { Client, PriceItem } from "@/lib/types";

export const metadata = { title: "New quote" };
export const dynamic = "force-dynamic";

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: { mode?: string; client?: string };
}) {
  await requireBoss();
  const supabase = createClient();
  const mode = searchParams.mode === "upload" ? "upload" : "build";

  const [{ data: clients }, { data: priceItems }] = await Promise.all([
    supabase.from("clients").select("*").order("name"),
    supabase
      .from("price_items")
      .select("*")
      .eq("is_active", true)
      .order("category")
      .order("label"),
  ]);

  const clientList = (clients ?? []) as Client[];

  return (
    <>
      <Link href="/quotes" className="btn-quiet" style={{ marginBottom: 6 }}>
        <ArrowLeft size={15} /> Quotes
      </Link>

      <PageHead
        title="New quote"
        subtitle="Build it from your price book, or upload one you've already sent."
      />

      <div className="chips" style={{ marginBottom: 16 }}>
        <Link href="/quotes/new" className="chip" data-active={mode === "build"}>
          Build a quote
        </Link>
        <Link href="/quotes/new?mode=upload" className="chip" data-active={mode === "upload"}>
          Upload a PDF
        </Link>
      </div>

      {clientList.length === 0 ? (
        <Card>
          <EmptyState title="Add a client first">
            A quote needs someone to go to.{" "}
            <Link href="/clients" className="strong">
              Add your first client →
            </Link>
          </EmptyState>
        </Card>
      ) : mode === "upload" ? (
        <UploadQuoteForm clients={clientList} />
      ) : (
        <QuoteBuilder
          clients={clientList}
          priceItems={(priceItems ?? []) as PriceItem[]}
          defaultFollowUpDays={Number(process.env.NEXT_PUBLIC_DEFAULT_FOLLOW_UP_DAYS || 7)}
        />
      )}
    </>
  );
}
