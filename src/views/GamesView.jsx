import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BrandMark } from '@/components/shared/BrandMark';
import { GameArtwork, GameLogo } from '@/components/shared/GameArtwork';
import { useGameThemes } from '@/context/AuthContext';
import { useT } from '@/context/I18nContext';
import { gameThemeStyle } from '@/lib/branding';
import { GAMES } from '@/lib/games';
import { cn } from '@/lib/utils';

const mod = (n, m) => ((n % m) + m) % m;

// How many slides are kept mounted on each side of the current one. Two is
// enough to cover the whole catalogue at today's five games, and it keeps the
// neighbours a swipe could reach already decoded.
const WINDOW = 2;

/**
 * The game catalogue.
 *
 * @param {function} onSelect   Entered a game.
 * @param {string}   startGame  Which slide to open on - the game just left, so
 *                              stepping out of a workbench and back in lands
 *                              where the user was standing.
 */
export function GamesView({ onSelect, startGame }) {
  const t = useT();
  // An unbounded position, not an index into GAMES. The carousel is endless:
  // the window of mounted slides is re-cut around `pos` on every move and each
  // slide is laid out at its own position, so there is no first or last slide
  // to bounce off. Walking right past Custom slides straight into Minecraft in
  // the same direction, and the rewind the old wrapping index caused - the
  // whole track flying back across four slides - cannot happen.
  const [pos, setPos] = useState(() => Math.max(0, GAMES.findIndex((game) => game.id === startGame)));
  const carouselRef = useRef(null);
  const count = GAMES.length;
  const index = mod(pos, count);
  const themes = useGameThemes();

  // Take the shorter way round to a given game rather than unwinding through
  // everything between here and there.
  const goTo = useCallback((target) => {
    setPos((p) => {
      let delta = mod(target, count) - mod(p, count);
      if (delta > count / 2) delta -= count;
      if (delta < -count / 2) delta += count;
      return p + delta;
    });
  }, [count]);

  const goPrev = useCallback(() => setPos((p) => p - 1), []);
  const goNext = useCallback(() => setPos((p) => p + 1), []);

  useEffect(() => {
    const node = carouselRef.current;
    if (!node) return undefined;
    const handleKeyDown = (event) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
      } else if (event.key === 'Home') {
        event.preventDefault();
        goTo(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        goTo(count - 1);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect(GAMES[index].id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goPrev, goNext, goTo, count, index, onSelect]);

  const activeGame = GAMES[index];

  return (
    <main className="game-catalogue game-catalogue-enter relative h-dvh w-full overflow-hidden">
      <section
        ref={carouselRef}
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label={t('games.count')}
        data-game={activeGame.id}
        className="game-carousel absolute inset-0 outline-none"
      >
        <div
          className="game-carousel-track"
          style={{ transform: `translateX(${-pos * 100}%)` }}
        >
          {Array.from({ length: WINDOW * 2 + 1 }, (_, offset) => {
            const slot = pos - WINDOW + offset;
            const game = GAMES[mod(slot, count)];
            const active = slot === pos;
            return (
            <button
              key={slot}
              type="button"
              data-game={game.id}
              aria-hidden={!active}
              aria-label={t(`games.${game.id}`)}
              tabIndex={-1}
              onClick={() => (active ? onSelect(game.id) : setPos(slot))}
              className="game-carousel-slide"
              style={{
                left: `${slot * 100}%`,
                ...gameThemeStyle(themes?.[game.id]),
              }}
            >
              <GameArtwork
                gameId={game.id}
                eager={active}
                className={cn('game-carousel-artwork', game.id === 'custom' && 'opacity-[0.45] grayscale')}
              />
              <span className="game-carousel-scrim" aria-hidden="true" />
              {game.id === 'custom' && <span className="game-carousel-scanlines" aria-hidden="true" />}
              <span className={cn('game-carousel-content', game.id === 'custom' && 'game-carousel-content-custom')}>
                {game.logo ? (
                  <GameLogo gameId={game.id} className="game-carousel-mark h-24 w-[min(80vw,18rem)] sm:h-32 sm:w-[26rem] lg:h-36 lg:w-[32rem]" fallbackClassName="text-primary" />
                ) : game.id === 'custom' ? (
                  <span className="flex flex-col items-center gap-8 px-6 text-center sm:gap-10">
                    <span className="game-carousel-pixel-title font-pixel text-xl uppercase text-foreground sm:text-2xl lg:text-3xl">
                      {t('games.custom')}
                    </span>
                    <span className="game-carousel-start-hint font-pixel text-label uppercase tracking-[0.35em] text-muted-foreground sm:text-xs">
                      {t('games.customStart')}
                    </span>
                  </span>
                ) : (
                  <span className="font-display text-3xl font-extrabold uppercase leading-none tracking-[0.01em] text-foreground sm:text-4xl lg:text-5xl">
                    {t(`games.${game.id}`)}
                  </span>
                )}
              </span>
            </button>
            );
          })}
        </div>

        <BrandMark className="game-carousel-brand absolute left-4 top-4 z-10 w-auto sm:left-7 sm:top-7" />

        <button
          type="button"
          onClick={goPrev}
          aria-label={t('games.previous')}
          className="game-carousel-arrow game-carousel-arrow-prev"
        >
          <span className="game-carousel-arrow-icon">
            <ChevronLeft className="h-9 w-9" />
          </span>
        </button>
        <button
          type="button"
          onClick={goNext}
          aria-label={t('games.next')}
          className="game-carousel-arrow game-carousel-arrow-next"
        >
          <span className="game-carousel-arrow-icon">
            <ChevronRight className="h-9 w-9" />
          </span>
        </button>
      </section>
    </main>
  );
}
