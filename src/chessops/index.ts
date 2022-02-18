import _ from "lodash";

import type {
  Uci,
  San,
  Variant,
  Fen,
  GameNodeId,
  Shape,
  RichLegalSan,
} from "./chessops";

export type { Uci, San, Variant, Fen, GameNodeId, Shape, RichLegalSan };

import {
  VARIANT_DISPLAY_NAMES,
  SEVEN_TAG_ROASTER,
  PROMOTION_PIECES,
  PROMOTION_PIECE_NAMES,
  PROMOTION_PIECES_EXT,
  MOVE_RATINGS,
  storeKey,
  Pos_,
  Pos,
  Game_,
  Game,
  GameNode_,
  GameNode,
  chessgroundDests,
  guessChessopsVariant,
} from "./chessops";

export {
  VARIANT_DISPLAY_NAMES,
  SEVEN_TAG_ROASTER,
  PROMOTION_PIECES,
  PROMOTION_PIECE_NAMES,
  PROMOTION_PIECES_EXT,
  MOVE_RATINGS,
  storeKey,
  Pos_,
  Pos,
  Game_,
  Game,
  GameNode_,
  GameNode,
  chessgroundDests,
  guessChessopsVariant,
};

import type {
  EngineState,
  Commands,
  GoPayload,
  ScoreType,
  ScoreValue,
  ScoreNumerical,
  PvItem,
  AnalysisInfo,
  SendAnalysisInfo,
} from "./uciengine";

export type {
  EngineState,
  Commands,
  GoPayload,
  ScoreType,
  ScoreValue,
  ScoreNumerical,
  PvItem,
  AnalysisInfo,
  SendAnalysisInfo,
};

import {
  DepthItem,
  UciEngine,
  UciEngineNode,
  //UciEngineBrowser,
  MATE_SCORE,
  PV_MAX_LENGTH,
  INFINITE,
} from "./uciengine";

export {
  DepthItem,
  UciEngine,
  UciEngineNode,
  //UciEngineBrowser,
  MATE_SCORE,
  PV_MAX_LENGTH,
  INFINITE,
};

/*export function engineTest() {
  const game = Game();

  const sendAnalysisInfo = (info: AnalysisInfo) => {
    // do something with analysis info
  };

  const engine =
    typeof window !== "undefined"
      ? new UciEngineBrowser(
          "./binweb/stockfish.wasm.js",
          sendAnalysisInfo
        ).spawn()
      : new UciEngineNode("./bin/stockfish", sendAnalysisInfo).spawn();

  engine.go({
    depth: INFINITE,
    multipv: 2,
    bestmoveCallback: (info) => console.log("first go done", info.bestmove),
  });

  setTimeout((_) => {
    game.playSan("Nf3");
    engine.go({
      depth: INFINITE,
      multipv: 2,
      fen: game.current.fen,
      bestmoveCallback: (info) => console.log("second go done", info.bestmove),
    });
  }, 2000);

  setTimeout((_) => {
    engine.stop();
    setTimeout(() => engine.kill(), 2000);
  }, 4000);
}*/

const testPgn = `[Event "Rated Bullet game"]
[Site "https://lichess.org/Fbh96Cgx"]
[Date "2021.12.01"]
[White "xavi75"]
[Black "hyperchessbotauthor"]
[Result "0-1"]
[UTCDate "2021.12.01"]
[UTCTime "07:44:16"]
[WhiteElo "1945"]
[BlackElo "1919"]
[WhiteRatingDiff "-6"]
[BlackRatingDiff "+6"]
[Variant "Standard"]
[TimeControl "60+0"]
[ECO "C00"]
[Opening "French Defense: Queen's Knight"]
[Termination "Time forfeit"]
[Annotator "lichess.org"]

1. e4 e6 2. Nc3 { C00 French Defense: Queen's Knight } Ne7 3. d3 Ng6 4. Bd2 Be7 5. Qc1 O-O 6. h3 d6 7. Be2 Nd7 8. Nf3 e5 9. Nh2 f5 10. O-O f4 11. Qd1 Nf6 12. Ng4 Nxg4 13. Bxg4 Bxg4 14. Qxg4 Qc8 15. Qf3 Qe6 16. Kh1 c6 17. Ne2 Kh8 18. Ng1 Bg5 19. c3 Bh6 20. d4 Ne7 21. Ne2 g5 22. Qg4 Qf7 23. f3 Ng6 24. dxe5 dxe5 25. c4 Qg7 26. c5 Nh4 27. Bc3 Rad8 28. Qe6 Rde8 29. Qc4 Ng6 30. Nc1 Ne7 31. Nd3 Ng8 32. Bxe5 Rxe5 33. Nxe5 Qxe5 34. Rad1 Bg7 35. Rd6 Qxb2 36. Rfd1 Qc3 37. Qe6 Qf6 38. Qg4 Qf7 39. Qxg5 h6 40. Qg4 Nf6 { Black wins on time. } 0-1

[Event "Rated Bullet game"]
[Site "https://lichess.org/yOlAIoZy"]
[Date "2021.12.01"]
[White "hyperchessbotauthor"]
[Black "DiegoC32"]
[Result "1-0"]
[UTCDate "2021.12.01"]
[UTCTime "07:42:01"]
[WhiteElo "1913"]
[BlackElo "1914"]
[WhiteRatingDiff "+6"]
[BlackRatingDiff "-5"]
[Variant "Standard"]
[TimeControl "60+0"]
[ECO "A00"]
[Opening "Van't Kruijs Opening"]
[Termination "Time forfeit"]
[Annotator "lichess.org"]

1. e3 { A00 Van't Kruijs Opening } e5 2. Ne2 d5 3. Ng3 Nc6 4. Be2 Nf6 5. O-O Be6 6. d3 Bd6 7. Nd2 Qd7 8. e4 d4 9. a4 a6 10. c4 dxc3 11. bxc3 O-O 12. Nc4 Be7 13. Be3 b5 14. axb5 axb5 15. Rxa8 Rxa8 16. Nd2 b4 17. cxb4 Nxb4 18. Nc4 Bxc4 19. dxc4 Qxd1 20. Rxd1 Rd8 21. Nf5 Rxd1+ 22. Bxd1 Bf8 23. f3 Nd7 24. Ba4 Nb6 25. Bb5 g6 26. Ng3 Bd6 27. Ne2 f5 28. Nc3 f4 29. Bf2 Nd7 30. Bxd7 Kf7 31. Bb5 Ke7 32. Ba4 Nd3 33. Nd5+ Kd8 34. Kf1 Bb4 35. Nxb4 Nb2 36. Nd5 { White wins on time. } 1-0`;

/*const g = Game()

g.mergePgn(testPgn)

console.log(Object.keys(g.nodes).length)*/

/*const g = Game()

g.playSansStr("e3 d5 Bb5")

console.log(g.pos.checkedKingUci())*/
