// For image files
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.png';
declare module '*.gif';

// For SVG files
declare module '*.svg' {
  import * as React from 'react';
  export const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
  const src: string;
  export default src;
}

// For Word files
declare module '*.docx' {
  const src: string;
  export default src;
}

// For external libraries
declare module 'pizzip';
declare module 'docxtemplater';
