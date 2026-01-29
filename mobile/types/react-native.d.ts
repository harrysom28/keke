// IMPORTANT:
// Do NOT declare/override `module 'react-native'` here.
// This project already depends on the official React Native typings.
// Overriding the module causes errors like:
// "Module 'react-native' has no exported member 'TouchableOpacity'."

export {};

// Global require declaration for React Native image imports
declare var require: {
  (path: string): any;
  context?(
    directory: string,
    useSubdirectories?: boolean,
    regExp?: RegExp
  ): {
    keys(): string[];
    (id: string): any;
    <T>(id: string): T;
    resolve(id: string): string;
    id: string;
  };
};

