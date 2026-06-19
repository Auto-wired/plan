import { EVENT_CATEGORIES, ALL_EVENT_CATEGORIES, isAllCategoriesSelected, type EventCategory } from '../../lib/categories'
import './CategoryFilterBar.css'

interface CategoryFilterBarProps {
  selectedCategories: EventCategory[]
  onChange: (categories: EventCategory[]) => void
}

export function CategoryFilterBar({
  selectedCategories,
  onChange,
}: CategoryFilterBarProps) {
  const isAllSelected = isAllCategoriesSelected(selectedCategories)

  const handleShowAll = () => {
    onChange(ALL_EVENT_CATEGORIES)
  }

  const handleCategoryToggle = (category: EventCategory) => {
    if (isAllSelected) {
      onChange(ALL_EVENT_CATEGORIES.filter((item) => item !== category))
      return
    }

    if (selectedCategories.includes(category)) {
      const next = selectedCategories.filter((item) => item !== category)
      onChange(next.length === 0 ? ALL_EVENT_CATEGORIES : next)
      return
    }

    onChange([...selectedCategories, category])
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
          const isActive = isAllSelected || selectedCategories.includes(cat.value)
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
