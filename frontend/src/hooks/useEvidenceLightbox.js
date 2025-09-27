import { useState, useCallback } from 'react';

export const useEvidenceLightbox = (images = []) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const openLightbox = useCallback((image, index = 0, imageList = images) => {
    // If specific image is provided, find its index in the list
    if (image && imageList) {
      const foundIndex = imageList.findIndex(img => img.id === image.id);
      setCurrentIndex(foundIndex >= 0 ? foundIndex : index);
    } else {
      setCurrentIndex(index);
    }
    setIsOpen(true);
  }, [images]);

  const closeLightbox = useCallback(() => {
    setIsOpen(false);
  }, []);

  const goToNext = useCallback((offset = 1) => {
    setCurrentIndex(prevIndex => {
      const newIndex = prevIndex + offset;
      if (newIndex >= images.length) {
        return 0; // Loop to beginning
      }
      return newIndex;
    });
  }, [images.length]);

  const goToPrevious = useCallback((offset = 1) => {
    setCurrentIndex(prevIndex => {
      const newIndex = prevIndex - offset;
      if (newIndex < 0) {
        return images.length - 1; // Loop to end
      }
      return newIndex;
    });
  }, [images.length]);

  const goToIndex = useCallback((index) => {
    if (index >= 0 && index < images.length) {
      setCurrentIndex(index);
    }
  }, [images.length]);

  return {
    isOpen,
    currentIndex,
    currentImage: images[currentIndex],
    openLightbox,
    closeLightbox,
    goToNext,
    goToPrevious,
    goToIndex,
    hasImages: images.length > 0,
    imageCount: images.length
  };
};