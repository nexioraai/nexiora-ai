const PEXELS_API_KEY = process.env.PEXELS_API_KEY!;

async function pexelsFetch(url: string) {
  const res = await fetch(url, {
    headers: { Authorization: PEXELS_API_KEY },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function getPhotos(query: string, count: number = 3): Promise<string[]> {
  const data = await pexelsFetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}`
  );
  return data?.photos?.map((p: any) => p.src.large) || [];
}

export async function getVideo(query: string): Promise<string | null> {
  const data = await pexelsFetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=3`
  );
  const videos = data?.videos || [];
  for (const video of videos) {
    const hd = video.video_files?.find((f: any) => f.quality === 'hd' || f.quality === 'sd');
    if (hd?.link) return hd.link;
  }
  return null;
}
