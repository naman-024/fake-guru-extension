export interface VideoTranscript {
  videoId: string;
  title: string;
  text: string;
  channelId: string;
}

export async function getChannelIdFromVideo(videoId: string): Promise<string | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { items: { snippet: { channelId: string } }[] };
    return data.items?.[0]?.snippet?.channelId ?? null;
  } catch (_) { return null; }
}

export async function getVideoTitleFromApi(videoId: string): Promise<string> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return "Unknown video";
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`
    );
    if (!res.ok) return "Unknown video";
    const data = (await res.json()) as { items: { snippet: { title: string } }[] };
    return data.items?.[0]?.snippet?.title ?? "Unknown video";
  } catch (_) { return "Unknown video"; }
}

export async function getChannelVideos(
  channelId: string, maxResults = 6
): Promise<{ videoId: string; title: string }[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY not set");

  // If it looks like a handle (@name) or custom name, resolve to a real channelId first
  let resolvedId = channelId;
  if (!channelId.startsWith("UC")) {
    const handle = channelId.startsWith("@") ? channelId : `@${channelId}`;
    const lookupRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`
    );
    if (lookupRes.ok) {
      const lookupData = (await lookupRes.json()) as { items?: { id: string }[] };
      resolvedId = lookupData.items?.[0]?.id ?? channelId;
    }
  }

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${resolvedId}&type=video&order=date&maxResults=${maxResults}&key=${apiKey}`
  );
  if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
  const data = (await res.json()) as {
    items: { id: { videoId: string }; snippet: { title: string } }[];
  };
  return (data.items ?? []).map((item) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
  }));
}

export async function getTranscript(videoId: string): Promise<string> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch(
        `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&lang=en`,
        { headers: { "x-api-key": apiKey } }
      );
      if (res.ok) {
        const data = await res.json() as {
          content?: string | { text: string }[] | unknown;
        };
        if (data.content) {
          // Supadata can return a plain string OR an array of segment objects
          if (typeof data.content === "string") return data.content;
          if (Array.isArray(data.content)) {
            return data.content
              .map((seg: unknown) =>
                typeof seg === "string" ? seg :
                (seg as { text?: string })?.text ?? ""
              )
              .join(" ")
              .trim();
          }
        }
      }
    } catch (_) {}
  }
  try {
    const fallback = await fetch(`https://youtubetranscript.com/?server_vid2=${videoId}`);
    if (fallback.ok) {
      const text = await fallback.text();
      return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
  } catch (_) {}
  return "[Transcript unavailable — this video may not have captions]";
}

export async function fetchTranscriptsForChannel(
  channelId: string, currentVideoId: string, currentTitle: string
): Promise<VideoTranscript[]> {
  const videos = await getChannelVideos(channelId, 6);
  if (!videos.some((v) => v.videoId === currentVideoId)) {
    videos.unshift({ videoId: currentVideoId, title: currentTitle });
  }
  const results: VideoTranscript[] = [];
  for (const video of videos.slice(0, 6)) {
    const text = await getTranscript(video.videoId);
    results.push({ videoId: video.videoId, title: video.title, text, channelId });
  }
  return results.sort((a) => (a.videoId === currentVideoId ? -1 : 1));
}
