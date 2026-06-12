import { EVENT_CATEGORIES, type EventCategory } from '../../lib/categories'
import './CategoryFilterBar.css'

interface CategoryFilterBarProps {
  selectedCategories: EventCategory[]
  onChange: (categories: EventCategory[]) => void
}

export function CategoryFilterBar({
  selectedCategories,
  onChange,
}: CategoryFilterBarProps) {
  const isAllSelected = selectedCategories.length === 0

  const handleShowAll = () => {
    onChange([])
  }

  const handleCategoryToggle = (category: EventCategory) => {
    if (selectedCategories.includes(category)) {
      onChange(selectedCategories.filter((c) => c !== category))
    } else {
      onChange([...selectedCategories, category])
    }
  }

  return (
    <div className="category-filter" role="group" aria-label="카테고리 필터">
      <span className="category-filter-label">카테고리</span>

      <div className="category-filter-options">
        <button
          type="button"
          className={`category-filter-btn${isAllSelected ? ' active' : ''}`}
          onClick={handleShowAll}
          aria-pressed={isAllSelected}
        >
          전체
        </button>

        {EVENT_CATEGORIES.map((cat) => {
          const isActive = selectedCategories.includes(cat.value)
          return (
            <button
              key={cat.value}
              type="button"
              className={`category-filter-btn${isActive ? ' active' : ''}`}
              onClick={() => handleCategoryToggle(cat.value)}
              aria-pressed={isActive}
            >
              <span className="category-filter-dot" style={{ background: cat.color }} />
              {cat.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
