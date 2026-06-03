"use client";
import React from 'react';

export function TableSkeleton() {
  return (
    <div className="w-full animate-pulse">
      <div className="h-10 bg-zinc-200 dark:bg-zinc-800 rounded-lg w-full mb-4"></div>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4 mb-3">
          <div className="h-14 bg-zinc-100 dark:bg-zinc-900 rounded-lg flex-1"></div>
          <div className="h-14 bg-zinc-100 dark:bg-zinc-900 rounded-lg flex-1 hidden sm:block"></div>
          <div className="h-14 bg-zinc-100 dark:bg-zinc-900 rounded-lg w-24"></div>
        </div>
      ))}
    </div>
  );
}

export function MetricSkeleton() {
  return (
    <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 animate-pulse">
      <div className="flex items-center gap-4 mb-4">
        <div className="h-12 w-12 bg-zinc-200 dark:bg-zinc-800 rounded-2xl"></div>
        <div className="h-4 w-1/3 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
      </div>
      <div className="h-8 w-1/2 bg-zinc-200 dark:bg-zinc-800 rounded"></div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 animate-pulse h-72 overflow-hidden flex flex-col">
       <div className="h-40 bg-zinc-200 dark:bg-zinc-800"></div>
       <div className="p-4 flex-1 flex flex-col justify-between">
          <div>
            <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-1/2 mb-4"></div>
          </div>
          <div className="h-8 bg-zinc-200 dark:bg-zinc-800 rounded w-1/3"></div>
       </div>
    </div>
  );
}
