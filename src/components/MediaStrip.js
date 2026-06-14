import { useState } from 'react';

export default function MediaStrip({ media = [], single }) {
  const [lightbox, setLightbox] = useState(null); // {url, isVideo}
  if (!media || media.length === 0) return null;

  const open = (e, item) => { e.stopPropagation(); setLightbox(item); };

  return (
    <>
      <div className={`media-strip ${single || media.length === 1 ? 'single' : ''}`}>
        {media.map((m, i) => {
          const url = typeof m === 'string' ? m : m.url;
          const isVideo = (typeof m === 'object' && m.type === 'video') || /\.(mp4|mov|webm)/i.test(url || '');
          return isVideo
            ? <video key={i} src={url} controls playsInline onClick={(e) => open(e, { url, isVideo })} />
            : <img key={i} src={url} alt={`media ${i + 1}`} onClick={(e) => open(e, { url, isVideo })} />;
        })}
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <button className="lightbox-close" aria-label="Close">✕</button>
          {lightbox.isVideo
            ? <video src={lightbox.url} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} />
            : <img src={lightbox.url} alt="full size" onClick={(e) => e.stopPropagation()} />}
        </div>
      )}
    </>
  );
}
