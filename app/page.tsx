import { Suspense } from "react";
import { connection } from "next/server";
import SetupNotice from "@/components/setup-notice";
import Wishlist from "@/components/wishlist";
import { appPassword } from "@/lib/env";
import { db, setupProblems, storageDescription } from "@/lib/store";

async function SavedItems() {
  await connection(); // a lista muda a cada item salvo: sempre ler na hora do acesso
  const problems = setupProblems();
  if (problems.length > 0) return <SetupNotice problems={problems} />;
  const [items, categories] = await Promise.all([db.listItems(), db.listCategories()]);
  return (
    <Wishlist
      initialItems={items}
      initialCategories={categories}
      canLogout={appPassword() !== ""}
      storageNote={storageDescription()}
    />
  );
}

export default function Home() {
  return (
    <Suspense fallback={<Wishlist initialItems={[]} initialCategories={[]} loading />}>
      <SavedItems />
    </Suspense>
  );
}
