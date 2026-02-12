interface SkeletonProps {
  className?: string;
}

/**
 * Skeleton loading placeholder with pulse animation.
 */
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-nodes-border/50 ${className}`}
    />
  );
}

/**
 * Channel skeleton for loading state.
 */
export function ChannelSkeleton() {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 mx-2 rounded">
      <Skeleton className="w-4 h-4 rounded" />
      <Skeleton className="h-4 flex-1" />
    </div>
  );
}

/**
 * Channel list skeleton showing multiple channel placeholders.
 */
export function ChannelListSkeleton() {
  return (
    <div className="space-y-1">
      <ChannelSkeleton />
      <ChannelSkeleton />
      <ChannelSkeleton />
      <ChannelSkeleton />
    </div>
  );
}

/**
 * Member skeleton for loading state.
 */
export function MemberSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <Skeleton className="w-8 h-8 rounded-full" />
      <Skeleton className="h-4 w-24" />
    </div>
  );
}

/**
 * Member list skeleton showing multiple member placeholders.
 */
export function MemberListSkeleton() {
  return (
    <div className="space-y-1">
      <MemberSkeleton />
      <MemberSkeleton />
      <MemberSkeleton />
      <MemberSkeleton />
      <MemberSkeleton />
    </div>
  );
}
