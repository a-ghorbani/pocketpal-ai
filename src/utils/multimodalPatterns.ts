// Projector (mmproj) filename pattern. Kept in a dependency-free module so the
// pure device-rules parser can share it without pulling in the store/UI/RN layer
// that multimodalHelpers transitively depends on.
export const MMProjRegex = /[-_.]*mmproj[-_.].+\.gguf$/i;
