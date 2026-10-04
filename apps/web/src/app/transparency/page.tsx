import type { Metadata } from "next";
import { TransparencyView } from "@/components/transparency/transparency-view";

export const metadata: Metadata = {
  title: "Transparency",
  description:
    "The contract, its rules, the money it holds, who holds each role and every recent event.",
};

export default function TransparencyPage() {
  return (
    <div className="page-x flex flex-col gap-32 py-48">
      <div className="flex flex-col gap-16">
        <h1 className="text-heading-sm md:text-heading">Transparency</h1>
        <p className="max-w-640 text-body-lg text-snow">
          Everything below is read live from the blockchain. No function lets
          anyone, admins included, move escrowed rewards.
        </p>
      </div>
      <TransparencyView />
    </div>
  );
}
