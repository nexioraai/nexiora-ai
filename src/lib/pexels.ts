const PEXELS_API_KEY = process.env.PEXELS_API_KEY!;

export async function getPhotos(query: string, count: number = 3): Promise<string[]> {
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}`,
    { headers: { Authorization: PEXELS_API_KEY } }
  );
  const data = await res.json();
  return data.photos?.map((p: any) => p.src.large) || [];
}

export async function getVideo(query: string): Promise<string | null> {
  const res = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=1`,
    { headers: { Authorization: PEXELS_API_KEY } }
  );
  const data = await res.json();
  const video = data.videos?.[0];
  return video?.video_files?.find((f: any) => f.quality === 'hd')?.link || null;
}
