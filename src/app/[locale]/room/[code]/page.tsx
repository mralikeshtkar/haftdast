import { OnlineGame } from "@/components/OnlineGame";

export default async function RoomPage({ params }: PageProps<"/[locale]/room/[code]">) {
  const { code } = await params;
  return <OnlineGame code={code.toUpperCase()} />;
}
