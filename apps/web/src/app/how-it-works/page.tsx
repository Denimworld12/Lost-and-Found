import type { Metadata } from "next";
import Link from "next/link";
import { StepCard } from "@/components/home/step-card";
import { StateDiagram } from "@/components/how/state-diagram";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How rewards are locked, claimed and paid out on Campus Lost & Found.",
};

const FAQ = [
  {
    question: "Is this real money?",
    answer:
      "No. Everything runs on Sepolia, an Ethereum test network. Rewards and deposits use test ETH, which you get free from a faucet and which has no real value.",
  },
  {
    question: "What if the owner never confirms?",
    answer:
      "The owner has a fixed response window after a claim, shown on the item page. If it passes with no answer, the finder can collect the reward and their deposit.",
  },
  {
    question: "What if someone lies?",
    answer:
      "Either side can open a dispute during the response window. The campus security office checks what happened and decides who gets paid. A finder whose claim is rejected loses their deposit to the owner, so false claims cost money.",
  },
  {
    question: "Who can see my email?",
    answer:
      "Only the other student on an item you're part of, after a claim, so you can arrange the handover. Your email never goes on the blockchain or IPFS; only wallet addresses, amounts and statuses do.",
  },
] as const;

export default function HowItWorksPage() {
  return (
    <div className="flex flex-col">
      <div className="page-x flex flex-col gap-16 py-48">
        <h1 className="text-heading-sm md:text-heading-lg">How it works</h1>
        <p className="max-w-640 text-body-lg text-snow">
          A smart contract holds every reward until the item is back. Nobody,
          including the admins, can move it anywhere else.
        </p>
      </div>

      <div className="bg-white py-64 text-abyss">
        <div className="page-x flex flex-col gap-64">
          <div className="grid gap-48 lg:grid-cols-2">
            <section
              aria-labelledby="owner-title"
              className="flex flex-col gap-24"
            >
              <h2 id="owner-title" className="text-heading-sm text-abyss">
                If you lost something
              </h2>
              <ol className="flex flex-col gap-16">
                <StepCard step={1} tag="Owner" title="Post it with a reward">
                  Describe the item, where and when you lost it, and add a
                  photo. Lock a reward in test ETH.
                </StepCard>
                <StepCard step={2} tag="Owner" title="Meet the finder">
                  When someone claims it, you both see each other&apos;s college
                  email. Arrange the handover.
                </StepCard>
                <StepCard step={3} tag="Owner" title="Confirm it's returned">
                  Got it back? Confirm, and the finder is paid. Wrong item?
                  Reject the claim or open a dispute.
                </StepCard>
              </ol>
            </section>
            <section
              aria-labelledby="finder-title"
              className="flex flex-col gap-24"
            >
              <h2 id="finder-title" className="text-heading-sm text-abyss">
                If you found something
              </h2>
              <ol className="flex flex-col gap-16">
                <StepCard step={1} tag="Finder" title="Find the listing">
                  Browse open items. Every reward shown is already locked in the
                  contract.
                </StepCard>
                <StepCard step={2} tag="Finder" title="Claim it with a deposit">
                  Lock a small deposit to claim. You get it back with the reward
                  when the owner confirms.
                </StepCard>
                <StepCard step={3} tag="Finder" title="Get paid">
                  Hand the item over. Once the owner confirms, or the response
                  window passes, withdraw the reward and your deposit.
                </StepCard>
              </ol>
            </section>
          </div>

          <section
            aria-labelledby="states-title"
            className="flex flex-col gap-24"
          >
            <h2 id="states-title" className="text-heading-sm text-abyss">
              Every status an item can have
            </h2>
            <StateDiagram />
          </section>

          <section aria-labelledby="faq-title" className="flex flex-col gap-24">
            <h2 id="faq-title" className="text-heading-sm text-abyss">
              Questions
            </h2>
            <div className="flex flex-col divide-y divide-mist border-y border-mist">
              {FAQ.map(({ question, answer }) => (
                <details key={question} className="group py-16">
                  <summary className="flex min-h-44 cursor-pointer list-none items-center justify-between gap-16 font-clash text-subheading font-medium tracking-clash text-abyss [&::-webkit-details-marker]:hidden">
                    {question}
                    <span
                      aria-hidden="true"
                      className="text-heading-sm leading-none transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="max-w-720 pt-9 text-body text-abyss/80">
                    {answer}
                  </p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="page-x flex flex-col items-start gap-24 py-64">
        <h2 className="text-heading-sm md:text-heading">
          See what&apos;s been lost.
        </h2>
        <div className="flex flex-wrap gap-12">
          <Button asChild>
            <Link href="/items">Browse items</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/transparency">Check the contract</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
