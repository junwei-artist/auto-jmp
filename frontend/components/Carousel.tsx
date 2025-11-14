'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CarouselSlide {
  id: string
  title: string
  subtitle: string
  description: string
  ctaText: string
  ctaLink: string
  heroImage?: React.ReactNode
}

interface CarouselProps {
  slides: CarouselSlide[]
  autoPlay?: boolean
  autoPlayInterval?: number
  onSlideChange?: (index: number) => void
}

export function Carousel({ 
  slides, 
  autoPlay = false, 
  autoPlayInterval = 5000,
  onSlideChange 
}: CarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Minimum swipe distance (in pixels)
  const minSwipeDistance = 50

  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(index)
    onSlideChange?.(index)
  }, [onSlideChange])

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => {
      const newIndex = prev === 0 ? slides.length - 1 : prev - 1
      onSlideChange?.(newIndex)
      return newIndex
    })
  }, [slides.length, onSlideChange])

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => {
      const newIndex = prev === slides.length - 1 ? 0 : prev + 1
      onSlideChange?.(newIndex)
      return newIndex
    })
  }, [slides.length, onSlideChange])

  // Auto-play functionality
  useEffect(() => {
    if (autoPlay && slides.length > 1) {
      intervalRef.current = setInterval(() => {
        goToNext()
      }, autoPlayInterval)

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
        }
      }
    }
  }, [autoPlay, autoPlayInterval, slides.length, goToNext])

  // Touch handlers for mobile swipe
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return

    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe) {
      goToNext()
    }
    if (isRightSwipe) {
      goToPrevious()
    }

    // Reset touch values
    setTouchStart(null)
    setTouchEnd(null)
  }

  if (slides.length === 0) return null

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Slides Container */}
      <div
        className="relative w-full h-full"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -300 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="absolute inset-0 w-full h-full"
          >
            {slides[currentIndex] && (
              <div className="w-full h-full relative overflow-hidden">
                {slides[currentIndex].heroImage}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation Arrows - Desktop only */}
      {slides.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={goToPrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-white/80 hover:bg-white/90 backdrop-blur-sm shadow-lg hidden md:flex items-center justify-center"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-6 w-6 text-gray-700" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 h-12 w-12 rounded-full bg-white/80 hover:bg-white/90 backdrop-blur-sm shadow-lg hidden md:flex items-center justify-center"
            aria-label="Next slide"
          >
            <ChevronRight className="h-6 w-6 text-gray-700" />
          </Button>
        </>
      )}

      {/* Pagination Dots */}
      {slides.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center space-x-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === currentIndex
                  ? 'w-8 bg-white'
                  : 'w-2 bg-white/50 hover:bg-white/75'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

