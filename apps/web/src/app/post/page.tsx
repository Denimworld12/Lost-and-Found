import type { Metadata } from "next";
import { PostWizard } from "@/components/post/post-wizard";

export const metadata: Metadata = { title: "Report lost item" };

export default function PostPage() {
  return (
    <div className="page-x py-32 md:py-48">
      <div className="flex max-w-960 flex-col gap-32">
        <div className="flex flex-col gap-9">
          <h1 className="text-heading-sm md:text-heading">Report lost item</h1>
          <p className="text-body text-cloud">
            Post what you lost and lock a reward. The finder is paid when you
            confirm it&apos;s back.
          </p>
        </div>
        <PostWizard />
      </div>
    </div>
  );
}
