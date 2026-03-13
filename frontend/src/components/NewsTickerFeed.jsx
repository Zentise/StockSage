import { motion } from 'framer-motion';
import { Newspaper, ExternalLink } from 'lucide-react';

export default function NewsTickerFeed({ news }) {
  if (!news || news.length === 0) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Newspaper className="w-4 h-4 text-accent-yellow" />
          <h3 className="text-sm font-semibold text-white">Market News</h3>
        </div>
        <p className="text-gray-500 text-xs">No news available</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Newspaper className="w-4 h-4 text-accent-yellow" />
        <h3 className="text-sm font-semibold text-white">Market News</h3>
      </div>
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
        {news.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="group"
          >
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-transparent hover:border-white/10"
            >
              <p className="text-xs text-gray-200 leading-relaxed mb-1.5 line-clamp-2">{item.title}</p>
              <div className="flex items-center gap-2 text-[10px] text-gray-500">
                <span>{item.source || item.publisher}</span>
                {item.published && (
                  <span>
                    {new Date(item.published).toLocaleDateString()}
                  </span>
                )}
                <ExternalLink className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </a>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
