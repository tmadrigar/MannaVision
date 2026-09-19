// src/utils/vectorExperiences/types.ts

export interface AnimePerspectiveOptions {
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  scale?: number;
}

export interface AnimeExperienceInstance {
  seek: (progress: number) => void;
  updatePerspective: (options: AnimePerspectiveOptions) => void;
  destroy: () => void;
}
