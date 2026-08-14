import { Gamepad2 } from 'lucide-react';
import { gameById } from '@/lib/games';
import { cn } from '@/lib/utils';

export function GameLogo({ gameId, className, fallbackClassName }) {
  const game = gameById(gameId);
  if (!game.logo) return <Gamepad2 aria-hidden="true" className={cn('h-8 w-8', fallbackClassName, className)} />;
  return <img src={game.logo} alt={`${game.label} logo`} className={cn('block object-contain', className)} />;
}

export function GameArtwork({ gameId, className, eager = false }) {
  const game = gameById(gameId);
  if (!game.artwork) return <div aria-hidden="true" className={cn('game-artwork-placeholder', className)} />;
  return (
    <img
      src={game.artwork}
      alt=""
      aria-hidden="true"
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : 'auto'}
      className={cn('block h-full w-full object-cover', className)}
    />
  );
}
