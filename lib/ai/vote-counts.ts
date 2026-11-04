export function updateVoteCounts(current: { likes: number; dislikes: number; vote: number }, next: number) {
  return {
    vote: next,
    likes: current.likes - Number(current.vote === 1) + Number(next === 1),
    dislikes: current.dislikes - Number(current.vote === -1) + Number(next === -1),
  };
}
