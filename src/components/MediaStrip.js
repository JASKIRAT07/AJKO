export default function MediaStrip({ media = [], single }) {
  if (!media || media.length === 0) return null;
  return (
    <div className={`media-strip ${single || media.length === 1 ? 'single' : ''}`}>
      {media.map((m, i) => {
        const url = typeof m === 'string' ? m : m.url;
        const isVideo = (typeof m === 'object' && m.type === 'video') || /\.(mp4|mov|webm)/i.test(url || '');
        return isVideo
          ? <video key={i} src={url} controls playsInline />
          : <img key={i} src={url} alt={`media ${i + 1}`} />;
      })}
    </div>
  );
}
